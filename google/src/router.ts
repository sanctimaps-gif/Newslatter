// API du Newsletter Studio exécutée par Google Apps Script.
// Mêmes routes que l'interface utilise (/api/...), transportées dans un appel POST unique.
import { collectLinks, renderEmail, starterTemplates, type EmailDesign } from '../../shared/src/index';
import { hashPassword, hmac, newTotpSecret, randomToken, safeEqual, sha256, verifyPassword, verifyTotp } from './crypto';
import type { Db } from './db';
import { accountEmail, aliases, canSendAs, gmailApiAvailable, googleQuota, sendMail, sentToday } from './mail';
import { DEFAULT_SETTINGS, getSettings, props, saveSettings, siteUrl, scriptUrl } from './settings';
import privacyMd from '../../database/seeds/politique-confidentialite.md';
import { transactional } from './templates';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, msg: string): never => { throw new HttpError(status, msg); };
const now = () => new Date().toISOString();
const isEmail = (v: unknown) => typeof v === 'string' && v.length <= 254 && /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/.test(v);
const cleanName = (v: unknown) => { const s = String(v ?? '').trim().slice(0, 80); if (/[<>{}\\]/.test(s)) fail(400, 'Caractères non autorisés.'); return s || null; };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const CONSENT_TEXT = "J'accepte de recevoir la lettre d'information de SanctiMaps (actualités de la carte des saints, saint du jour, nouveautés du site). Je peux me désinscrire à tout moment grâce au lien présent dans chaque e-mail.";
const PURPOSE = 'Recevoir la lettre d\'information de SanctiMaps : le saint du jour, les nouveaux lieux et saints ajoutés à la carte et les nouveautés du site. Environ une lettre par semaine.';
const ROLE_RANK: Record<string, number> = { viewer: 1, editor: 2, admin: 3 };
/** Expéditeurs acceptés : une adresse @sanctimaps.fr, ou l'adresse Gmail qui fait tourner le script. */
const senderAllowed = (e: unknown) => isEmail(e) && (/@sanctimaps\.fr$/i.test(String(e)) || String(e).toLowerCase() === accountEmail().toLowerCase());
/** SPF / DKIM / DMARC ne se règlent que pour un domaine dont vous êtes propriétaire (pas pour gmail.com, déjà géré par Google). */
export const dnsRequired = (fromEmail: string) => /@sanctimaps\.fr$/i.test(fromEmail);

export const DEFAULT_AUTOMATIONS = [
  { key: 'welcome_email', name: 'E-mail de bienvenue', description: 'Envoie un message de bienvenue juste après la confirmation de l\'inscription (message transactionnel, non publicitaire).', enabled: false, config: { subject: 'Bienvenue dans la lettre de SanctiMaps', body: 'Merci d\'avoir confirmé votre inscription. Vous recevrez désormais la lettre de SanctiMaps : un saint, un lieu, une histoire.' } },
  { key: 'admin_signup_notification', name: 'Notification d\'inscription', description: 'Prévient l\'administrateur par e-mail à chaque nouvelle inscription confirmée.', enabled: false, config: { to: '' } },
  { key: 'editorial_reminder', name: 'Relance éditoriale', description: 'Rappelle à l\'administrateur de préparer la prochaine lettre si aucune campagne n\'est programmée ou envoyée depuis N jours.', enabled: false, config: { days: 7, to: '' } },
  { key: 'inactive_subscribers', name: 'Abonnés inactifs', description: 'Signale (sans les supprimer) les abonnés confirmés sans aucun clic depuis N mois.', enabled: false, config: { months: 12 } },
  { key: 'purge_unconfirmed', name: 'Purge des inscriptions non confirmées', description: 'Supprime les inscriptions restées non confirmées après N jours (minimisation des données, RGPD).', enabled: true, config: { days: 30 } },
];

export interface Ctx { db: Db; user: any | null; userAgent: string }

// ─── Jetons signés ───
const secret = () => props().getProperty('SECRET') ?? fail(500, 'Script non installé : exécutez la fonction « installer ».');
export const emailHash = (e: string) => hmac(`email:${e.trim().toLowerCase()}`, secret());
export const unsubscribeToken = (id: number) => `${id.toString(36)}.${hmac(`unsub:${id}`, secret()).slice(0, 32)}`;
export function readUnsubscribeToken(t: string): number | null {
  const [a, sig] = String(t ?? '').split('.'); const id = parseInt(a, 36);
  return id > 0 && sig && safeEqual(hmac(`unsub:${id}`, secret()).slice(0, 32), sig) ? id : null;
}
export const recipientToken = (id: number) => `${id.toString(36)}.${hmac(`rcpt:${id}`, secret()).slice(0, 16)}`;
export function readRecipientToken(t: string): number | null {
  const [a, sig] = String(t ?? '').split('.'); const id = parseInt(a, 36);
  return id > 0 && sig && safeEqual(hmac(`rcpt:${id}`, secret()).slice(0, 16), sig) ? id : null;
}
export const unsubscribeUrl = (id: number) => `${siteUrl()}#/desinscription?t=${encodeURIComponent(unsubscribeToken(id))}`;
const oneClickUrl = (id: number) => `${scriptUrl()}?action=unsubscribe&t=${encodeURIComponent(unsubscribeToken(id))}`;

// ─── Sessions (cache Google, 6 h max) ───
const cache = () => CacheService.getScriptCache();
function sessionOf(token: string): any | null {
  if (!token || token.length > 100) return null;
  const raw = cache().get(`sess_${sha256(token)}`);
  return raw ? JSON.parse(raw) : null;
}
function openSession(userId: number, pending2fa: boolean): string {
  const t = randomToken();
  cache().put(`sess_${sha256(t)}`, JSON.stringify({ uid: userId, pending2fa }), pending2fa ? 600 : 21600);
  return t;
}
export function authenticate(db: Db, token: string): any | null {
  const s = sessionOf(token);
  if (!s || s.pending2fa) return null;
  return db.find('Comptes', s.uid);
}
const publicUser = (u: any) => ({ id: u.id, email: u.email, displayName: u.display_name, role: u.role, totpEnabled: Boolean(u.totp_enabled) });
function audit(c: Ctx, action: string, entity?: string, entityId?: unknown, detail?: unknown) {
  c.db.insert('Audit', { user_id: c.user?.id ?? null, action, entity: entity ?? null, entity_id: entityId != null ? String(entityId) : null, detail: detail ?? null, created_at: now() });
}
function need(c: Ctx, role: 'viewer' | 'editor' | 'admin') {
  if (!c.user) fail(401, 'Authentification requise.');
  if (ROLE_RANK[c.user.role] < ROLE_RANK[role]) fail(403, 'Droits insuffisants.');
}
function passwordOk(p: unknown) {
  const s = String(p ?? '');
  if (s.length < 12 || s.length > 200) fail(400, 'Le mot de passe doit contenir au moins 12 caractères.');
  if (!/[a-z]/i.test(s) || !/\d/.test(s)) fail(400, 'Le mot de passe doit contenir des lettres et des chiffres.');
  return s;
}

// ─── Abonnés ───
const suppressed = (db: Db, email: string) => db.all('Exclusions').find((x) => x.email_hash === emailHash(email))?.reason ?? null;
function addSuppression(db: Db, email: string, reason: string) {
  const h = emailHash(email); const row = db.all('Exclusions').find((x) => x.email_hash === h);
  if (row) { if (!['complaint', 'erasure'].includes(row.reason)) row.reason = reason; db.touch('Exclusions'); }
  else db.insert('Exclusions', { email_hash: h, reason, created_at: now() });
}
function newConfirmationToken(db: Db, subscriberId: number): string {
  for (const t of db.all('Jetons')) if (t.subscriber_id === subscriberId && !t.used_at) t.used_at = now();
  const token = randomToken();
  db.insert('Jetons', { subscriber_id: subscriberId, token_hash: sha256(token), expires_at: new Date(Date.now() + 48 * 3600e3).toISOString(), used_at: null, created_at: now() });
  return token;
}


export function sendConfirmation(db: Db, sub: any, token: string) {
  const url = `${siteUrl()}#/confirmation?t=${encodeURIComponent(token)}`;
  return transactional(db, sub.email, 'Confirmez votre inscription à la lettre de SanctiMaps', [
    ['heading', { text: 'Encore une étape', fontSize: 26 }],
    ['text', { text: `Bonjour${sub.first_name ? ' ' + sub.first_name : ''},\n\nVous avez demandé à recevoir la lettre de SanctiMaps. Pour confirmer votre inscription, cliquez sur le bouton ci-dessous. Ce lien est valable 48 heures.`, align: 'center' }],
    ['button', { label: 'Je confirme mon inscription', url }],
    ['text', { text: `Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :\n${url}\n\nVous n'êtes pas à l'origine de cette demande ? Ignorez simplement ce message : vous ne recevrez rien.`, fontSize: 13, align: 'center', color: '#6b6155' }],
  ], 'confirmation', sub.id);
}

function onConfirmed(db: Db, sub: any) {
  const autos = db.all('Automatisations');
  const welcome = autos.find((a) => a.key === 'welcome_email' && a.enabled);
  if (welcome) {
    const r = transactional(db, sub.email, String(welcome.config.subject || 'Bienvenue'), [
      ['heading', { text: String(welcome.config.subject || 'Bienvenue') }],
      ['text', { text: `Bonjour${sub.first_name ? ' ' + sub.first_name : ''},\n\n${welcome.config.body}` }],
      ['button', { label: 'Explorer la carte des saints', url: 'https://sanctimaps.fr/' }],
    ], 'welcome', sub.id);
    db.insert('Executions', { automation_key: 'welcome_email', status: r.status === 'accepted' ? 'ok' : 'error', detail: { subscriberId: sub.id }, created_at: now() });
  }
  const notif = autos.find((a) => a.key === 'admin_signup_notification' && a.enabled);
  if (notif) {
    const to = String(notif.config.to || '') || db.all('Comptes').find((u) => u.role === 'admin')?.email;
    if (to) {
      const r = transactional(db, to, 'Nouvel abonné confirmé', [['heading', { text: 'Nouvel abonné', fontSize: 24 }], ['text', { text: `**${sub.email}** vient de confirmer son inscription (source : ${sub.source}).` }]], 'admin_notification');
      db.insert('Executions', { automation_key: 'admin_signup_notification', status: r.status === 'accepted' ? 'ok' : 'error', detail: { subscriberId: sub.id }, created_at: now() });
    }
  }
}

export function unsubscribe(db: Db, id: number, method: string, campaignId?: number | null) {
  const s = db.find('Abonnes', id);
  if (!s) return null;
  if (s.status !== 'unsubscribed') {
    s.status = 'unsubscribed'; s.unsubscribed_at = s.unsubscribed_at ?? now(); db.touch('Abonnes');
    addSuppression(db, s.email, 'unsubscribe');
    db.insert('Consentements', { subscriber_id: s.id, action: 'unsubscribe', consent_text: null, source: method, user_agent: null, created_at: now() });
    for (const r of db.all('Destinataires')) if (r.subscriber_id === s.id && r.status === 'pending') { r.status = 'unsubscribed'; r.updated_at = now(); }
    db.touch('Destinataires');
    const camp = campaignId ?? db.all('Destinataires').filter((r) => r.subscriber_id === s.id && r.status === 'accepted').sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))[0]?.campaign_id;
    if (camp) db.insert('Evenements', { campaign_id: camp, recipient_id: null, subscriber_id: s.id, event_type: 'unsubscribe', link_id: null, detail: { method }, created_at: now() });
  }
  return s;
}

export function applyDeliveryEvent(db: Db, type: 'hard_bounce' | 'soft_bounce' | 'complaint', email: string, diagnostic: string, rcpt?: any) {
  const sub = db.all('Abonnes').find((x) => x.email === email.toLowerCase());
  db.insert('Evenements', { campaign_id: rcpt?.campaign_id ?? null, recipient_id: rcpt?.id ?? null, subscriber_id: sub?.id ?? null, event_type: type === 'hard_bounce' ? 'bounce_hard' : type === 'soft_bounce' ? 'bounce_soft' : 'complaint', link_id: null, detail: { diagnostic: diagnostic.slice(0, 300) }, created_at: now() });
  if (rcpt && type !== 'complaint') { rcpt.status = 'bounced'; rcpt.last_error = diagnostic.slice(0, 300); rcpt.updated_at = now(); db.touch('Destinataires'); }
  if (!sub) return;
  if (type === 'complaint') { unsubscribe(db, sub.id, 'complaint'); addSuppression(db, sub.email, 'complaint'); }
  else if (type === 'hard_bounce') { if (['confirmed', 'pending'].includes(sub.status)) sub.status = 'bounced'; sub.bounce_count = (sub.bounce_count ?? 0) + 1; addSuppression(db, sub.email, 'hard_bounce'); db.touch('Abonnes'); }
  else {
    sub.bounce_count = (sub.bounce_count ?? 0) + 1;
    const recent = db.all('Evenements').filter((e) => e.subscriber_id === sub.id && e.event_type === 'bounce_soft' && +new Date(e.created_at) > Date.now() - 30 * 86400e3).length;
    if (recent >= 3 && sub.status === 'confirmed') sub.status = 'bounced';
    db.touch('Abonnes');
  }
}

// ─── Campagnes ───
export function eligible(db: Db, a: any) {
  const supp = new Set(db.all('Exclusions').map((x) => x.email_hash));
  let rows = db.all('Abonnes').filter((x) => x.status === 'confirmed' && !x.anonymized_at);
  let rules: any = null;
  if (a?.type === 'segment') rules = db.find('Segments', a.segmentId)?.rules ?? fail(400, 'Segment introuvable');
  if (a?.type === 'rules') rules = a;
  if (a?.type === 'selection') rows = rows.filter((x) => (a.subscriberIds ?? []).includes(x.id));
  if (rules?.sources?.length) rows = rows.filter((x) => rules.sources.includes(x.source));
  if (rules?.tags?.length) rows = rows.filter((x) => (x.tags ?? []).some((t: string) => rules.tags.includes(t)));
  return rows.filter((x) => !supp.has(emailHash(x.email)));
}

export function campaignStats(db: Db, id: number) {
  const rs = db.all('Destinataires').filter((r) => r.campaign_id === id);
  const ev = db.all('Evenements').filter((e) => e.campaign_id === id);
  const n = (f: (r: any) => boolean, list = rs) => list.filter(f).length;
  const accepted = n((r) => r.status === 'accepted');
  const clickers = new Set(ev.filter((e) => e.event_type === 'click').map((e) => e.recipient_id)).size;
  const links = db.all('Liens').filter((l) => l.campaign_id === id).map((l) => ({ url: l.url, clicks: n((e) => e.event_type === 'click' && e.link_id === l.id, ev) })).sort((a, b) => b.clicks - a.clicks);
  return {
    targeted: rs.length, accepted, bounced: n((r) => r.status === 'bounced'), failed: n((r) => r.status === 'failed'),
    pending: n((r) => r.status === 'pending' || r.status === 'sending'), uncertain: n((r) => r.status === 'uncertain'), skipped: n((r) => ['skipped', 'unsubscribed'].includes(r.status)),
    clicks: n((e) => e.event_type === 'click', ev), unique_clickers: clickers, unique_opens: 0,
    unsubscribes: n((e) => e.event_type === 'unsubscribe', ev), complaints: n((e) => e.event_type === 'complaint', ev),
    hard_bounces: n((e) => e.event_type === 'bounce_hard', ev), soft_bounces: n((e) => e.event_type === 'bounce_soft', ev),
    click_rate: accepted ? Math.round((clickers / accepted) * 1000) / 10 : null, links,
  };
}

export function renderForRecipient(db: Db, camp: any, sub: any, rcpt?: any) {
  const s = getSettings();
  const links = new Map(db.all('Liens').filter((l) => l.campaign_id === camp.id).map((l) => [l.url, l.id]));
  const track = s.tracking.clicks && rcpt ? (url: string) => { const lid = links.get(url); return lid ? `${siteUrl()}#/r?k=${encodeURIComponent(recipientToken(rcpt.id))}&l=${lid}` : url; } : undefined;
  return renderEmail(camp.design, { subject: camp.subject, preheader: camp.preheader ?? undefined, firstName: sub?.first_name ?? null, unsubscribeUrl: sub ? unsubscribeUrl(sub.id) : `${siteUrl()}#/desinscription`, privacyUrl: `${siteUrl()}#/confidentialite`, legalText: s.organization.legalText, trackLink: track });
}
export function listUnsubscribeHeaders(subscriberId: number, campaignId: number) {
  return { 'List-Unsubscribe': `<${oneClickUrl(subscriberId)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', 'List-Id': 'La lettre de SanctiMaps <newsletter.sanctimaps.fr>', 'X-Campaign-Id': String(campaignId) };
}

export function prepareCampaign(db: Db, camp: any) {
  if (camp.status !== 'queued') return;
  const existing = new Set(db.all('Destinataires').filter((r) => r.campaign_id === camp.id).map((r) => r.subscriber_id));
  for (const s of eligible(db, camp.audience)) if (!existing.has(s.id)) db.insert('Destinataires', { campaign_id: camp.id, subscriber_id: s.id, email: s.email, status: 'pending', attempts: 0, message_id: null, last_error: null, sent_at: null, updated_at: now() });
  const known = new Set(db.all('Liens').filter((l) => l.campaign_id === camp.id).map((l) => l.url));
  for (const url of collectLinks(camp.design)) if (!known.has(url)) db.insert('Liens', { campaign_id: camp.id, url });
  camp.status = 'sending'; camp.started_at = camp.started_at ?? now();
  camp.recipient_count = db.all('Destinataires').filter((r) => r.campaign_id === camp.id).length;
  camp.updated_at = now(); db.touch('Campagnes');
}

// ─── Statistiques ───
function period(q: any) {
  const p = q.period ?? '30d';
  let from: Date; let to = new Date();
  if (p === 'custom' && q.from && q.to) { from = new Date(q.from); to = new Date(`${q.to}T23:59:59`); }
  else from = new Date(Date.now() - (({ '7d': 7, '30d': 30, '90d': 90, '12m': 365 } as any)[p] ?? 30) * 86400e3);
  const days = (+to - +from) / 86400e3;
  return { from, to, bucket: days > 120 ? 'month' : days > 45 ? 'week' : 'day' };
}
function buckets(from: Date, to: Date, bucket: string) {
  const out: Date[] = []; const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), bucket === 'month' ? 1 : from.getUTCDate()));
  while (d <= to) { out.push(new Date(d)); if (bucket === 'day') d.setUTCDate(d.getUTCDate() + 1); else if (bucket === 'week') d.setUTCDate(d.getUTCDate() + 7); else d.setUTCMonth(d.getUTCMonth() + 1); }
  return out;
}
function dashboard(db: Db, q: any) {
  const { from, to, bucket } = period(q);
  const inP = (v: any) => v && new Date(v) >= from && new Date(v) <= to;
  const subs = db.all('Abonnes'); const rcpts = db.all('Destinataires'); const ev = db.all('Evenements'); const camps = db.all('Campagnes');
  const bs = buckets(from, to, bucket);
  const series = bs.map((b, i) => {
    const end = bs[i + 1] ?? new Date(+to + 1);
    const inB = (v: any) => v && new Date(v) >= b && new Date(v) < end;
    return {
      date: b.toISOString().slice(0, 10),
      signups: subs.filter((x) => inB(x.created_at)).length, confirmations: subs.filter((x) => inB(x.confirmed_at)).length, unsubscribes: subs.filter((x) => inB(x.unsubscribed_at)).length,
      total: subs.filter((x) => x.confirmed_at && new Date(x.confirmed_at) < end && (!x.unsubscribed_at || new Date(x.unsubscribed_at) >= end)).length,
      accepted: rcpts.filter((r) => r.status === 'accepted' && inB(r.sent_at)).length, bounced: rcpts.filter((r) => r.status === 'bounced' && inB(r.updated_at)).length,
      clicks: ev.filter((e) => e.event_type === 'click' && inB(e.created_at)).length,
    };
  });
  const recentBy = (list: any[], k: string, n = 6) => [...list].filter((x) => x[k] && !x.anonymized_at).sort((a, b) => String(b[k]).localeCompare(String(a[k]))).slice(0, n);
  const logs = db.all('Journal');
  return {
    period: { from, to, bucket },
    totals: {
      confirmed: subs.filter((x) => x.status === 'confirmed').length, pending: subs.filter((x) => x.status === 'pending').length,
      new_confirmed: subs.filter((x) => inP(x.confirmed_at)).length, new_signups: subs.filter((x) => inP(x.created_at)).length,
      unsubscribed_period: subs.filter((x) => inP(x.unsubscribed_at)).length, unsubscribed_total: subs.filter((x) => x.status === 'unsubscribed').length, bounced_total: subs.filter((x) => x.status === 'bounced').length,
    },
    content: { newsletters: db.all('Newsletters').length, campaigns_sent: camps.filter((c) => c.status === 'sent').length, campaigns_scheduled: camps.filter((c) => c.status === 'scheduled').length, campaigns_sending: camps.filter((c) => ['queued', 'sending'].includes(c.status)).length },
    delivery: { accepted: rcpts.filter((r) => r.status === 'accepted' && inP(r.sent_at)).length, bounced: rcpts.filter((r) => r.status === 'bounced' && inP(r.updated_at)).length, failed: rcpts.filter((r) => r.status === 'failed' && inP(r.updated_at)).length },
    clicks: { clicks: ev.filter((e) => e.event_type === 'click' && inP(e.created_at)).length, unique_clickers: new Set(ev.filter((e) => e.event_type === 'click' && inP(e.created_at)).map((e) => e.recipient_id)).size },
    growth: series.map(({ date, signups, confirmations, unsubscribes, total }) => ({ date, signups, confirmations, unsubscribes, total })),
    activity: series.map(({ date, accepted, bounced, clicks }) => ({ date, accepted, bounced, clicks })),
    comparison: camps.filter((c) => c.started_at).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))).slice(0, 8).map((c) => { const st = campaignStats(db, c.id); return { id: c.id, name: c.name, finished_at: c.finished_at, accepted: st.accepted, bounced: st.bounced, clickers: st.unique_clickers, unsubscribes: st.unsubscribes }; }),
    recent: {
      signups: recentBy(subs, 'created_at'), unsubscribes: recentBy(subs, 'unsubscribed_at'),
      campaigns: [...camps].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 6).map(({ design, ...c }) => c),
      sends: [...logs].reverse().slice(0, 6), errors: [...logs].reverse().filter((l) => l.status !== 'accepted').slice(0, 6), jobErrors: [],
    },
  };
}

// ─── Import CSV ───
const norm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_-]+/g, ' ').trim();
function parseCsv(text: string) {
  const first = text.split(/\r?\n/)[0] ?? '';
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') ? '\t' : ',';
  return { delim, rows: Utilities.parseCsv(text.replace(/^﻿/, ''), delim).filter((r: string[]) => r.some((c) => String(c).trim())).map((r: string[]) => r.map((c) => String(c).trim())) as string[][] };
}
const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };

// ─── Médias (Google Drive, lien public en lecture) ───
function sniff(bytes: number[]): string | null {
  const b = bytes.slice(0, 12).map((x) => (x < 0 ? x + 256 : x));
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  return null;
}
function mediaFolder() {
  const p = props(); const id = p.getProperty('MEDIA_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch { /* recréé */ } }
  const f = DriveApp.createFolder('Newsletter Studio — images');
  p.setProperty('MEDIA_FOLDER_ID', f.getId());
  return f;
}
function storeImage(file: any) {
  if (!file?.data) fail(400, 'Aucun fichier reçu.');
  const bytes = Utilities.base64Decode(file.data);
  if (bytes.length > 5 * 1024 * 1024) fail(400, 'Image trop lourde (5 Mo maximum).');
  const mime = sniff(bytes) ?? fail(400, 'Format non autorisé : PNG, JPEG, GIF ou WebP uniquement.');
  const ext = mime.split('/')[1].replace('jpeg', 'jpg');
  const name = `${now().slice(0, 7)}-${randomToken().slice(0, 12)}.${ext}`;
  const f = mediaFolder().createFile(Utilities.newBlob(bytes, mime, name));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { file_id: f.getId(), filename: name, mime_type: mime, size_bytes: bytes.length, url: `https://lh3.googleusercontent.com/d/${f.getId()}` };
}

// ─── DNS (résolveur public de Google, requête réelle) ───
function txt(name: string): string[] | string {
  try {
    const res = JSON.parse(UrlFetchApp.fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`, { muteHttpExceptions: true }).getContentText());
    return (res.Answer ?? []).filter((a: any) => a.type === 16).map((a: any) => String(a.data).replace(/^"|"$/g, '').replace(/" "/g, ''));
  } catch (e: any) { return `résolution impossible (${e.message})`; }
}
function checkDomain(fromEmail: string, selector: string) {
  const domain = fromEmail.split('@')[1]?.toLowerCase() ?? '';
  const details: Record<string, string> = {};
  const spfR = txt(domain); const spfs = Array.isArray(spfR) ? spfR.filter((r) => /^v=spf1/i.test(r)) : [];
  details.spf = typeof spfR === 'string' ? spfR : spfs.length === 1 ? spfs[0] : spfs.length ? `Plusieurs enregistrements SPF (invalide)` : 'Aucun enregistrement SPF trouvé.';
  const dm = txt(`_dmarc.${domain}`); const dmarc = Array.isArray(dm) ? dm.find((r) => /^v=DMARC1/i.test(r)) : undefined;
  details.dmarc = typeof dm === 'string' ? dm : dmarc ?? 'Aucun enregistrement DMARC trouvé.';
  let dkim = false;
  if (!selector) details.dkim = 'Sélecteur DKIM non renseigné.';
  else { const dk = txt(`${selector}._domainkey.${domain}`); const rec = Array.isArray(dk) ? dk.find((r) => /p=/.test(r)) : undefined; dkim = Boolean(rec); details.dkim = typeof dk === 'string' ? dk : rec ? `${rec.slice(0, 80)}…` : 'Aucune clé DKIM trouvée pour ce sélecteur.'; }
  return { checkedAt: now(), domain, spf: spfs.length === 1, dkim, dmarc: Boolean(dmarc), details };
}

// ─── Point d'entrée ───
export function route(c: Ctx, method: string, path: string, body: any): any {
  const { db } = c;
  const url = path.split('?'); const p = url[0];
  const q: any = Object.fromEntries((url[1] ?? '').split('&').filter(Boolean).map((kv) => kv.split('=').map(decodeURIComponent)));
  const m = (re: RegExp) => p.match(re);
  let r: RegExpMatchArray | null;
  const settings = getSettings();
  body = body ?? {};

  // ═══ Public ═══
  if (p === '/api/public/config') return { consentText: CONSENT_TEXT, confirmationHours: 48, purpose: PURPOSE, needsSetup: db.all('Comptes').length === 0 };

  if (p === '/api/public/subscribe') {
    if (body.consent !== true) fail(400, 'Le consentement explicite est obligatoire.');
    const ok = { ok: true, message: 'Merci ! Si cette adresse est valide, vous allez recevoir un e-mail pour confirmer votre inscription. Pensez à vérifier vos courriers indésirables.' };
    if (body.website) return ok;
    if (body.startedAt && Date.now() - Number(body.startedAt) < 2500) return ok;
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!isEmail(email)) fail(400, 'Adresse e-mail invalide.');
    // Limitation globale (Apps Script ne transmet pas l'adresse IP) : 20 demandes / 10 min
    const k = `subs_${Math.floor(Date.now() / 600000)}`; const n = Number(cache().get(k) ?? 0);
    if (n >= 20) fail(429, 'Trop de demandes d\'inscription en ce moment. Réessayez dans quelques minutes.');
    cache().put(k, String(n + 1), 700);
    const firstName = cleanName(body.firstName);
    const source = body.source === 'site-principal' ? 'site-principal' : 'formulaire';
    let s = db.all('Abonnes').find((x) => x.email === email);
    if (s && (s.status === 'confirmed' || s.status === 'suspended' || s.anonymized_at)) return ok;
    if (s && db.all('Jetons').some((t) => t.subscriber_id === s.id && +new Date(t.created_at) > Date.now() - 120e3)) return ok;
    if (!s) s = db.insert('Abonnes', { email, first_name: firstName, last_name: null, status: 'pending', source, tags: [], subscribed_at: now(), confirmed_at: null, unsubscribed_at: null, bounce_count: 0, last_activity_at: null, anonymized_at: null, notes: null, created_at: now() });
    else if (firstName && !s.first_name) { s.first_name = firstName; db.touch('Abonnes'); }
    db.insert('Consentements', { subscriber_id: s.id, action: s.status === 'unsubscribed' ? 'resubscribe_request' : 'request', consent_text: CONSENT_TEXT, source, user_agent: c.userAgent.slice(0, 300), created_at: now() });
    sendConfirmation(db, s, newConfirmationToken(db, s.id));
    return ok;
  }

  if (p === '/api/public/confirm') {
    const t = db.all('Jetons').find((x) => x.token_hash === sha256(String(body.token ?? '')));
    if (!t) fail(400, 'Ce lien de confirmation n\'est pas valide.');
    if (t.used_at) fail(400, 'Ce lien a déjà été utilisé : votre inscription est probablement déjà confirmée.');
    if (new Date(t.expires_at) < new Date()) fail(400, 'Ce lien a expiré (validité 48 h). Inscrivez-vous de nouveau pour en recevoir un autre.');
    t.used_at = now(); db.touch('Jetons');
    const s = db.find('Abonnes', t.subscriber_id);
    if (!s || !['pending', 'unsubscribed'].includes(s.status) || s.anonymized_at) fail(400, 'Ce lien de confirmation n\'est pas valide.');
    Object.assign(s, { status: 'confirmed', confirmed_at: now(), unsubscribed_at: null }); db.touch('Abonnes');
    db.insert('Consentements', { subscriber_id: s.id, action: 'confirm', consent_text: CONSENT_TEXT, source: s.source, user_agent: c.userAgent.slice(0, 300), created_at: now() });
    // Nouvelle action explicite et confirmée de la personne : l'exclusion « désinscription » est levée.
    db.set('Exclusions', db.all('Exclusions').filter((x) => !(x.email_hash === emailHash(s.email) && ['unsubscribe', 'manual'].includes(x.reason))));
    onConfirmed(db, s);
    return { ok: true, firstName: s.first_name };
  }

  if (p === '/api/public/unsubscribe' && method === 'GET') {
    const id = readUnsubscribeToken(q.t); const s = id ? db.find('Abonnes', id) : null;
    if (!s) fail(400, 'Lien de désinscription invalide.');
    const [u, d] = s.email.split('@');
    return { ok: true, email: s.anonymized_at ? null : `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`, status: s.status };
  }
  if (p === '/api/public/unsubscribe' || p === '/api/public/unsubscribe/one-click') {
    const id = readUnsubscribeToken(body.t ?? q.t);
    if (!id || !unsubscribe(db, id, p.endsWith('one-click') ? 'one-click' : 'page')) fail(400, 'Lien de désinscription invalide.');
    return { ok: true };
  }
  if (p === '/api/public/privacy') return { markdown: settings.privacyPolicy.markdown || privacyMd, reviewed: settings.privacyPolicy.reviewed, contactEmail: settings.organization.contactEmail, organization: settings.organization.name };

  if (p === '/api/public/click') {
    const link = db.find('Liens', body.l) ?? fail(404, 'Lien introuvable.');
    const rid = readRecipientToken(body.k);
    const rc = rid ? db.find('Destinataires', rid) : null;
    if (rc && rc.campaign_id === link.campaign_id) {
      db.insert('Evenements', { campaign_id: rc.campaign_id, recipient_id: rc.id, subscriber_id: rc.subscriber_id, event_type: 'click', link_id: link.id, detail: null, created_at: now() });
      const s = db.find('Abonnes', rc.subscriber_id); if (s) { s.last_activity_at = now(); db.touch('Abonnes'); }
    }
    return { url: link.url };
  }

  // ═══ Authentification ═══
  if (p === '/api/auth/setup') {
    if (db.all('Comptes').length) fail(403, 'Un administrateur existe déjà.');
    const code = props().getProperty('SETUP_CODE');
    if (!code || !safeEqual(String(body.code ?? '').trim(), code)) fail(403, 'Code d\'installation incorrect (visible dans le journal d\'exécution de la fonction « installer »).');
    if (!isEmail(body.email)) fail(400, 'Adresse e-mail invalide.');
    const u = db.insert('Comptes', { email: String(body.email).toLowerCase(), display_name: cleanName(body.name) ?? 'Administrateur', role: 'admin', password_hash: hashPassword(passwordOk(body.password)), totp_secret: null, totp_enabled: false, failed_logins: 0, locked_until: null, last_login_at: now(), created_at: now() });
    props().deleteProperty('SETUP_CODE');
    c.user = u; audit(c, 'auth.setup', 'user', u.id);
    return { user: publicUser(u), token: openSession(u.id, false) };
  }
  if (p === '/api/auth/login') {
    const u = db.all('Comptes').find((x) => x.email === String(body.email ?? '').trim().toLowerCase());
    if (!u) { verifyPassword(String(body.password ?? ''), 'pbkdf2$500$00$00'); fail(401, 'Identifiants incorrects.'); }
    if (u.locked_until && new Date(u.locked_until) > new Date()) fail(429, 'Compte temporairement verrouillé après plusieurs échecs. Réessayez dans 15 minutes.');
    if (!verifyPassword(String(body.password ?? ''), u.password_hash)) {
      u.failed_logins = (u.failed_logins ?? 0) + 1;
      if (u.failed_logins >= 5) { u.failed_logins = 0; u.locked_until = new Date(Date.now() + 15 * 60e3).toISOString(); }
      db.touch('Comptes'); c.user = u; audit(c, 'auth.login_failed', 'user', u.id);
      fail(401, 'Identifiants incorrects.');
    }
    u.failed_logins = 0; u.locked_until = null; db.touch('Comptes');
    if (u.totp_enabled) return { twoFactorRequired: true, token: openSession(u.id, true) };
    u.last_login_at = now(); c.user = u; audit(c, 'auth.login', 'user', u.id);
    return { user: publicUser(u), token: openSession(u.id, false) };
  }
  if (p === '/api/auth/2fa') {
    const s = sessionOf(body.__token);
    if (!s?.pending2fa) fail(401, 'Session expirée, reconnectez-vous.');
    const u = db.find('Comptes', s.uid);
    if (!u?.totp_secret || !verifyTotp(u.totp_secret, body.code)) fail(401, 'Code incorrect.');
    cache().remove(`sess_${sha256(body.__token)}`);
    u.last_login_at = now(); db.touch('Comptes'); c.user = u; audit(c, 'auth.login', 'user', u.id, { twoFactor: true });
    return { user: publicUser(u), token: openSession(u.id, false) };
  }
  if (p === '/api/auth/logout') { if (body.__token) cache().remove(`sess_${sha256(body.__token)}`); return { ok: true }; }
  if (p === '/api/auth/me') { if (!c.user) fail(401, 'Non connecté.'); return { user: publicUser(c.user), token: body.__token }; }
  if (p === '/api/auth/password-reset/request') {
    const u = db.all('Comptes').find((x) => x.email === String(body.email ?? '').trim().toLowerCase());
    if (u) {
      const t = randomToken(); cache().put(`reset_${sha256(t)}`, String(u.id), 3600);
      transactional(db, u.email, 'Réinitialisation de votre mot de passe — Newsletter Studio', [['heading', { text: 'Réinitialiser le mot de passe', fontSize: 24 }], ['text', { text: 'Une réinitialisation du mot de passe de votre compte a été demandée. Le lien est valable 1 heure.', align: 'center' }], ['button', { label: 'Choisir un nouveau mot de passe', url: `${siteUrl()}#/admin/reinitialisation?t=${t}` }]], 'password_reset');
    }
    return { ok: true, message: 'Si un compte correspond à cette adresse, un lien de réinitialisation valable 1 heure a été envoyé.' };
  }
  if (p === '/api/auth/password-reset/confirm') {
    const key = `reset_${sha256(String(body.token ?? ''))}`; const uid = cache().get(key);
    if (!uid) fail(400, 'Lien invalide ou expiré.');
    const u = db.find('Comptes', uid); u.password_hash = hashPassword(passwordOk(body.password)); u.failed_logins = 0; u.locked_until = null; db.touch('Comptes');
    cache().remove(key); c.user = u; audit(c, 'auth.password_reset', 'user', u.id);
    return { ok: true };
  }
  if (p.startsWith('/api/auth/')) {
    need(c, 'viewer'); const u = c.user;
    if (p === '/api/auth/password') { if (!verifyPassword(String(body.current ?? ''), u.password_hash)) fail(400, 'Mot de passe actuel incorrect.'); u.password_hash = hashPassword(passwordOk(body.next)); db.touch('Comptes'); audit(c, 'auth.password_changed', 'user', u.id); return { ok: true }; }
    if (p === '/api/auth/2fa/setup') { const sec = newTotpSecret(); if (!u.totp_enabled) { u.totp_secret = sec; db.touch('Comptes'); } return { secret: sec, otpauth: `otpauth://totp/${encodeURIComponent(`SanctiMaps Newsletter:${u.email}`)}?secret=${sec}&issuer=SanctiMaps%20Newsletter&digits=6&period=30` }; }
    if (p === '/api/auth/2fa/enable') { if (!u.totp_secret || !verifyTotp(u.totp_secret, body.code)) fail(400, 'Code incorrect : vérifiez l\'heure de votre téléphone.'); u.totp_enabled = true; db.touch('Comptes'); audit(c, 'auth.2fa_enabled', 'user', u.id); return { ok: true }; }
    if (p === '/api/auth/2fa/disable') { if (!verifyPassword(String(body.password ?? ''), u.password_hash)) fail(400, 'Mot de passe incorrect.'); u.totp_enabled = false; u.totp_secret = null; db.touch('Comptes'); audit(c, 'auth.2fa_disabled', 'user', u.id); return { ok: true }; }
  }

  // ═══ Administration ═══
  if (!p.startsWith('/api/admin/')) fail(404, 'Introuvable.');
  need(c, method === 'GET' || p === '/api/admin/render' || p === '/api/admin/audience/count' || p === '/api/admin/profile' ? 'viewer' : 'editor');

  if (p === '/api/admin/dashboard') return dashboard(db, q);
  if (p === '/api/admin/stats/campaigns') {
    const { from, to } = period(q);
    const camps = db.all('Campagnes').filter((x) => x.started_at && new Date(x.started_at) >= from && new Date(x.started_at) <= to).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))).map(({ design, ...x }) => ({ ...x, stats: campaignStats(db, x.id) }));
    const totals = camps.reduce((a, x) => ({ targeted: a.targeted + x.stats.targeted, accepted: a.accepted + x.stats.accepted, bounced: a.bounced + x.stats.bounced, clickers: a.clickers + x.stats.unique_clickers, clicks: a.clicks + x.stats.clicks, unsubscribes: a.unsubscribes + x.stats.unsubscribes, opens: 0 }), { targeted: 0, accepted: 0, bounced: 0, clickers: 0, clicks: 0, unsubscribes: 0, opens: 0 });
    const by: Record<string, number> = {}; for (const x of db.all('Abonnes').filter((y) => y.status === 'confirmed')) by[x.source] = (by[x.source] ?? 0) + 1;
    return { period: period(q), campaigns: camps, totals, sources: Object.entries(by).map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n), opensTracked: false };
  }

  // ─── Abonnés ───
  if (p === '/api/admin/subscribers' && method === 'GET') {
    let rows = db.all('Abonnes').filter((x) => !x.anonymized_at);
    const counts: Record<string, number> = {}; for (const x of rows) counts[x.status] = (counts[x.status] ?? 0) + 1;
    const term = String(q.q ?? '').toLowerCase();
    if (term) rows = rows.filter((x) => [x.email, x.first_name, x.last_name].some((v) => String(v ?? '').toLowerCase().includes(term)));
    if (q.status) rows = rows.filter((x) => x.status === q.status);
    if (q.source) rows = rows.filter((x) => x.source === q.source);
    const by = (k: string, dir = 1) => (a: any, b: any) => dir * String(a[k] ?? '￿').localeCompare(String(b[k] ?? '￿'));
    const sorts: Record<string, (a: any, b: any) => number> = { created_desc: by('created_at', -1), created_asc: by('created_at'), email_asc: by('email'), email_desc: by('email', -1), name_asc: by('first_name'), confirmed_desc: (a, b) => String(b.confirmed_at ?? '').localeCompare(String(a.confirmed_at ?? '')) };
    rows = [...rows].sort(sorts[q.sort] ?? sorts.created_desc);
    const page = Math.max(1, Number(q.page ?? 1)); const size = Math.min(200, Math.max(5, Number(q.pageSize ?? 25)));
    return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pageSize: size, counts };
  }
  if (p === '/api/admin/subscribers/sources') return [...new Set(db.all('Abonnes').map((x) => x.source))].sort();
  if (p === '/api/admin/subscribers' && method === 'POST') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!isEmail(email)) fail(400, 'Adresse e-mail invalide');
    if (db.all('Abonnes').some((x) => x.email === email)) fail(409, 'Cette adresse existe déjà.');
    const supp = suppressed(db, email); if (supp) fail(409, `Cette adresse figure sur la liste d'exclusion (${supp}). Seule la personne elle-même peut se réinscrire via le formulaire.`);
    const s = db.insert('Abonnes', { email, first_name: cleanName(body.firstName), last_name: cleanName(body.lastName), status: 'pending', source: 'ajout-manuel', tags: (body.tags ?? []).slice(0, 20), subscribed_at: now(), confirmed_at: null, unsubscribed_at: null, bounce_count: 0, last_activity_at: null, anonymized_at: null, notes: body.notes ?? null, created_at: now() });
    db.insert('Consentements', { subscriber_id: s.id, action: 'admin_add', consent_text: body.consentNote || 'Ajout manuel par l\'administrateur', source: 'ajout-manuel', user_agent: null, created_at: now() });
    if (body.sendConfirmation !== false) sendConfirmation(db, s, newConfirmationToken(db, s.id));
    audit(c, 'subscriber.create', 'subscriber', s.id);
    return s;
  }
  if ((r = m(/^\/api\/admin\/subscribers\/(\d+)\/export$/))) {
    need(c, 'admin'); const s = db.find('Abonnes', r[1]) ?? fail(404, 'Abonné introuvable.');
    audit(c, 'subscriber.export_personal_data', 'subscriber', s.id);
    return { generated_at: now(), controller: 'SanctiMaps — https://sanctimaps.fr/', subscriber: s, consent_records: db.all('Consentements').filter((x) => x.subscriber_id === s.id), campaigns_received: db.all('Destinataires').filter((x) => x.subscriber_id === s.id).map((x) => ({ campaign: db.find('Campagnes', x.campaign_id)?.name, status: x.status, sent_at: x.sent_at })), events: db.all('Evenements').filter((x) => x.subscriber_id === s.id) };
  }
  if ((r = m(/^\/api\/admin\/subscribers\/(\d+)$/))) {
    const s = db.find('Abonnes', r[1]); if (!s || s.anonymized_at) fail(404, 'Abonné introuvable.');
    if (method === 'GET') return { subscriber: s, consents: db.all('Consentements').filter((x) => x.subscriber_id === s.id).reverse(), campaigns: db.all('Destinataires').filter((x) => x.subscriber_id === s.id).map((x) => ({ id: x.campaign_id, name: db.find('Campagnes', x.campaign_id)?.name, status: x.status, sent_at: x.sent_at, last_error: x.last_error })), events: db.all('Evenements').filter((x) => x.subscriber_id === s.id) };
    if (method === 'DELETE') {
      need(c, 'admin');
      addSuppression(db, s.email, 'erasure');
      for (const x of db.all('Destinataires')) if (x.subscriber_id === s.id) { x.email = 'anonymise'; if (x.status === 'pending') x.status = 'skipped'; }
      for (const l of db.all('Journal')) if (l.to_email === s.email) l.to_email = 'anonymise';
      for (const x of db.all('Consentements')) if (x.subscriber_id === s.id) x.user_agent = null;
      db.set('Jetons', db.all('Jetons').filter((t) => t.subscriber_id !== s.id));
      Object.assign(s, { email: `anonyme-${s.id}-${randomToken().slice(0, 6)}@anonymise.invalid`, first_name: null, last_name: null, notes: null, tags: [], status: 'unsubscribed', unsubscribed_at: s.unsubscribed_at ?? now(), anonymized_at: now() });
      ['Abonnes', 'Destinataires', 'Journal', 'Consentements'].forEach((t) => db.touch(t as any));
      audit(c, 'subscriber.anonymize', 'subscriber', s.id); return { ok: true };
    }
    if (body.status === 'confirmed') fail(400, 'Le statut « confirmé » ne peut pas être posé à la main.');
    if (body.firstName !== undefined) s.first_name = cleanName(body.firstName);
    if (body.lastName !== undefined) s.last_name = cleanName(body.lastName);
    if (body.tags) s.tags = body.tags.slice(0, 20);
    if (body.notes !== undefined) s.notes = String(body.notes ?? '').slice(0, 2000);
    if (body.status === 'suspended') s.status = 'suspended';
    if (body.status === 'unsubscribed') unsubscribe(db, s.id, 'admin');
    if (body.status === 'restore') { if (s.status !== 'suspended') fail(400, 'Seule une adresse suspendue peut être rétablie.'); s.status = s.confirmed_at && !s.unsubscribed_at ? 'confirmed' : 'pending'; }
    db.touch('Abonnes'); audit(c, 'subscriber.update', 'subscriber', s.id, body);
    return s;
  }
  if (p === '/api/admin/subscribers-export.csv') {
    need(c, 'admin'); const st = q.status || 'confirmed';
    const rows = db.all('Abonnes').filter((x) => x.status === st && !x.anonymized_at);
    audit(c, 'subscriber.export_csv', 'subscriber', null, { status: st, count: rows.length });
    return '﻿' + ['email;prenom;nom;statut;source;inscription;confirmation;desinscription', ...rows.map((x) => [x.email, x.first_name, x.last_name, x.status, x.source, x.subscribed_at, x.confirmed_at, x.unsubscribed_at].map(csvCell).join(';'))].join('\n');
  }
  if (p === '/api/admin/subscribers/import/preview') {
    const f = body.file ?? fail(400, 'Aucun fichier reçu.');
    if (!/\.(csv|txt)$/i.test(f.name)) fail(400, 'Le fichier doit être au format .csv.');
    const text = Utilities.newBlob(Utilities.base64Decode(f.data)).getDataAsString('UTF-8');
    if (text.length > 2 * 1024 * 1024) fail(400, 'Fichier trop volumineux (2 Mo maximum).');
    if (text.includes('\u0000')) fail(400, 'Le fichier ne semble pas être un fichier texte CSV.');
    const { delim, rows } = parseCsv(text);
    if (!rows.length) fail(400, 'Fichier vide.');
    if (rows.length > 10001) fail(400, '10 000 lignes maximum par import.');
    const head = rows[0].map(norm);
    const pick = (al: string[]) => head.findIndex((h) => al.includes(h));
    const mapping: Record<string, number> = {};
    const e = pick(['email', 'e mail', 'mail', 'courriel', 'adresse', 'adresse e mail', 'adresse email', 'email address']); if (e >= 0) mapping.email = e;
    const fi = pick(['prenom', 'first name', 'firstname', 'given name']); if (fi >= 0) mapping.first_name = fi;
    const la = pick(['nom', 'last name', 'lastname', 'nom de famille', 'surname']); if (la >= 0) mapping.last_name = la;
    let data = rows.slice(1); let offset = 2;
    if (mapping.email === undefined) { const i = rows[0].findIndex(isEmail); if (i < 0) fail(400, 'Aucune colonne « email » détectée.'); mapping.email = i; data = rows; offset = 1; }
    const existing = new Map(db.all('Abonnes').map((x) => [x.email, x.status]));
    const supp = new Set(db.all('Exclusions').map((x) => x.email_hash));
    const seen = new Set<string>();
    const out = data.map((row, i) => {
      const email = String(row[mapping.email] ?? '').trim().toLowerCase();
      let status = 'ok';
      if (!isEmail(email)) status = 'invalid'; else if (seen.has(email)) status = 'duplicate_file'; else if (supp.has(emailHash(email))) status = 'suppressed'; else if (existing.has(email)) status = 'exists';
      seen.add(email);
      return { line: i + offset, email, firstName: mapping.first_name !== undefined ? String(row[mapping.first_name] ?? '').slice(0, 80) : '', lastName: mapping.last_name !== undefined ? String(row[mapping.last_name] ?? '').slice(0, 80) : '', status, note: '' };
    });
    const summary = out.reduce((a: any, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }), {});
    return { filename: f.name, delimiter: delim, columns: rows[0], mapping, summary, total: out.length, rows: out };
  }
  if (p === '/api/admin/subscribers/import/commit') {
    if (!String(body.sourceLabel ?? '').trim()) fail(400, 'Nom de la source obligatoire.');
    if (String(body.consentNote ?? '').trim().length < 10) fail(400, 'Décrivez l\'origine du consentement (10 caractères minimum).');
    const source = `import:${String(body.sourceLabel).replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 50)}`;
    let imported = 0, skipped = 0;
    for (const row of (body.rows ?? []).slice(0, 10000)) {
      const email = String(row.email ?? '').trim().toLowerCase();
      if (!isEmail(email) || suppressed(db, email) || db.all('Abonnes').some((x) => x.email === email)) { skipped++; continue; }
      // Toujours « en attente » : un import ne crée jamais d'abonné confirmé.
      const s = db.insert('Abonnes', { email, first_name: cleanName(row.firstName), last_name: cleanName(row.lastName), status: 'pending', source, tags: [], subscribed_at: now(), confirmed_at: null, unsubscribed_at: null, bounce_count: 0, last_activity_at: null, anonymized_at: null, notes: null, created_at: now() });
      db.insert('Consentements', { subscriber_id: s.id, action: 'import', consent_text: body.consentNote, source, user_agent: null, created_at: now() });
      if (body.sendConfirmation) sendConfirmation(db, s, newConfirmationToken(db, s.id));
      imported++;
    }
    audit(c, 'subscriber.import', 'subscriber', null, { imported, skipped, source });
    return { imported, skipped };
  }
  if (p === '/api/admin/segments') {
    if (method === 'GET') return db.all('Segments');
    if (!String(body.name ?? '').trim()) fail(400, 'Nom obligatoire.');
    return db.insert('Segments', { name: String(body.name).slice(0, 80), rules: body.rules ?? {}, created_at: now() });
  }
  if ((r = m(/^\/api\/admin\/segments\/(\d+)$/))) { db.set('Segments', db.all('Segments').filter((x) => x.id !== Number(r![1]))); return { ok: true }; }

  // ─── Newsletters et modèles ───
  const checkDesign = (d: any) => { if (!d?.settings || !Array.isArray(d.blocks) || d.blocks.length > 80) fail(400, 'Contenu invalide.'); return d; };
  if (p === '/api/admin/newsletters') {
    if (method === 'GET') return [...db.all('Newsletters')].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map(({ design, ...n }) => ({ ...n, block_count: design?.blocks?.length ?? 0, campaign_count: db.all('Campagnes').filter((x) => x.newsletter_id === n.id).length }));
    const n = db.insert('Newsletters', { title: String(body.title || 'Sans titre').slice(0, 150), design: checkDesign(body.design), template_id: body.templateId ?? null, created_at: now(), updated_at: now() });
    audit(c, 'newsletter.create', 'newsletter', n.id); return n;
  }
  if ((r = m(/^\/api\/admin\/newsletters\/(\d+)\/duplicate$/))) { const n = db.find('Newsletters', r[1]) ?? fail(404, 'Newsletter introuvable.'); return db.insert('Newsletters', { ...clone(n), id: null, title: `${n.title} (copie)`, created_at: now(), updated_at: now() }); }
  if ((r = m(/^\/api\/admin\/newsletters\/(\d+)$/))) {
    const n = db.find('Newsletters', r[1]) ?? fail(404, 'Newsletter introuvable.');
    if (method === 'GET') return n;
    if (method === 'DELETE') { db.set('Newsletters', db.all('Newsletters').filter((x) => x.id !== n.id)); audit(c, 'newsletter.delete', 'newsletter', n.id); return { ok: true }; }
    Object.assign(n, { title: String(body.title || 'Sans titre').slice(0, 150), design: checkDesign(body.design), updated_at: now() }); db.touch('Newsletters'); return n;
  }
  if (p === '/api/admin/templates') {
    if (method === 'GET') return db.all('Modeles');
    return db.insert('Modeles', { name: String(body.name || 'Modèle').slice(0, 100), description: String(body.description ?? '').slice(0, 300), category: 'personnalise', is_system: false, design: checkDesign(body.design), created_at: now(), updated_at: now() });
  }
  if ((r = m(/^\/api\/admin\/templates\/(\d+)\/duplicate$/))) { const t = db.find('Modeles', r[1]) ?? fail(404, 'Modèle introuvable.'); return db.insert('Modeles', { ...clone(t), id: null, name: `${t.name} (copie)`, is_system: false, created_at: now(), updated_at: now() }); }
  if ((r = m(/^\/api\/admin\/templates\/(\d+)$/))) {
    const t = db.find('Modeles', r[1]) ?? fail(404, 'Modèle introuvable.');
    if (method === 'GET') return t;
    if (method === 'DELETE') { db.set('Modeles', db.all('Modeles').filter((x) => x.id !== t.id)); audit(c, 'template.delete', 'template', t.id); return { ok: true }; }
    Object.assign(t, { name: String(body.name || t.name).slice(0, 100), description: String(body.description ?? '').slice(0, 300), design: checkDesign(body.design), updated_at: now() }); db.touch('Modeles'); return t;
  }
  if (p === '/api/admin/render') return renderEmail(checkDesign(body.design) as EmailDesign, { subject: body.subject ?? 'Aperçu', preheader: body.preheader, sampleData: body.sample !== false, firstName: null, unsubscribeUrl: `${siteUrl()}#/desinscription`, privacyUrl: `${siteUrl()}#/confidentialite`, legalText: settings.organization.legalText });

  // ─── Médias ───
  if (p === '/api/admin/media') {
    if (method === 'GET') return [...db.all('Medias')].reverse();
    const stored = storeImage(body.file);
    const md = db.insert('Medias', { ...stored, original_name: String(body.file.name).slice(0, 200), width: body.file.width ?? null, height: body.file.height ?? null, alt_text: String(body.alt ?? '').slice(0, 300), created_at: now() });
    audit(c, 'media.upload', 'media', md.id); return md;
  }
  if ((r = m(/^\/api\/admin\/media\/(\d+)\/replace$/))) {
    const md = db.find('Medias', r[1]) ?? fail(404, 'Image introuvable.');
    const previousUrl = md.url;
    Object.assign(md, storeImage(body.file), { original_name: String(body.file.name).slice(0, 200), width: body.file.width ?? null, height: body.file.height ?? null }); db.touch('Medias');
    return { ...md, previousUrl };
  }
  if ((r = m(/^\/api\/admin\/media\/(\d+)$/))) {
    const md = db.find('Medias', r[1]) ?? fail(404, 'Image introuvable.');
    if (method === 'DELETE') { try { DriveApp.getFileById(md.file_id).setTrashed(true); } catch { /* déjà supprimé */ } db.set('Medias', db.all('Medias').filter((x) => x.id !== md.id)); audit(c, 'media.delete', 'media', md.id); return { ok: true }; }
    md.alt_text = String(body.alt ?? '').slice(0, 300); db.touch('Medias'); return md;
  }

  // ─── Campagnes ───
  if (p === '/api/admin/audience/count') return { count: eligible(db, body.audience).length };
  const campaignFields = (b: any) => {
    if (!String(b.name ?? '').trim()) fail(400, 'Nom interne obligatoire');
    if (!String(b.subject ?? '').trim()) fail(400, 'Objet obligatoire');
    if (!senderAllowed(b.fromEmail)) fail(400, `L'adresse d'expédition doit être ${accountEmail()} ou une adresse @sanctimaps.fr configurée dans Gmail.`);
    if (b.replyTo && !isEmail(b.replyTo)) fail(400, 'Adresse de réponse invalide.');
    return { name: String(b.name).slice(0, 150), subject: String(b.subject).slice(0, 200), preheader: b.preheader ? String(b.preheader).slice(0, 200) : null, from_name: String(b.fromName || 'SanctiMaps').slice(0, 100), from_email: String(b.fromEmail).toLowerCase(), reply_to: b.replyTo || null, newsletter_id: b.newsletterId ?? null, design: checkDesign(b.design), audience: b.audience ?? { type: 'all' }, track_opens: false };
  };
  if (p === '/api/admin/campaigns') {
    if (method === 'GET') {
      let rows = db.all('Campagnes');
      if (q.status) rows = rows.filter((x) => String(q.status).split(',').includes(x.status));
      if (q.from) rows = rows.filter((x) => x.created_at >= q.from);
      if (q.to) rows = rows.filter((x) => x.created_at <= `${q.to}T23:59:59`);
      return [...rows].sort((a, b) => String(b.scheduled_at ?? b.created_at).localeCompare(String(a.scheduled_at ?? a.created_at))).map(({ design, ...x }) => { const st = campaignStats(db, x.id); return { ...x, accepted: st.accepted, bounced: st.bounced, clickers: st.unique_clickers }; });
    }
    const cmp = db.insert('Campagnes', { ...campaignFields(body), status: 'draft', scheduled_at: null, timezone: 'Europe/Paris', started_at: null, finished_at: null, recipient_count: null, created_at: now(), updated_at: now() });
    audit(c, 'campaign.create', 'campaign', cmp.id); return cmp;
  }
  if ((r = m(/^\/api\/admin\/campaigns\/(\d+)\/(test|send|cancel|unschedule|duplicate|recipients)$/))) {
    const cmp = db.find('Campagnes', r[1]) ?? fail(404, 'Campagne introuvable.');
    switch (r[2]) {
      case 'recipients': {
        let rows = db.all('Destinataires').filter((x) => x.campaign_id === cmp.id);
        if (q.status) rows = rows.filter((x) => x.status === q.status);
        const page = Math.max(1, Number(q.page ?? 1));
        return { rows: rows.slice((page - 1) * 50, page * 50), total: rows.length };
      }
      case 'duplicate': return db.insert('Campagnes', { ...clone(cmp), id: null, name: `${cmp.name} (copie)`, status: 'draft', scheduled_at: null, started_at: null, finished_at: null, recipient_count: null, created_at: now(), updated_at: now() });
      case 'test': {
        const to = String(body.to ?? '').trim().toLowerCase();
        if (!isEmail(to)) fail(400, 'Adresse de test invalide.');
        const allowed = [...db.all('Comptes').map((u) => u.email), accountEmail().toLowerCase(), settings.organization.contactEmail, settings.sender.replyTo, settings.sender.fromEmail].filter(Boolean).map((x) => String(x).toLowerCase());
        if (!allowed.includes(to)) fail(400, 'Le test ne peut être envoyé qu\'à une adresse contrôlée : un compte du studio, votre Gmail, l\'adresse de contact ou d\'expédition.');
        const out = sendMail(db, { to, subject: `[TEST] ${cmp.subject}`, ...renderForRecipient(db, cmp, { id: 0, first_name: 'Testeur' }), fromName: cmp.from_name, fromEmail: cmp.from_email, replyTo: cmp.reply_to ?? undefined, kind: 'test', campaignId: cmp.id, headers: { 'X-SanctiMaps-Test': 'true' } });
        if (out.status === 'accepted') saveSettings({ ...settings, testEmail: { sentAt: now(), to } });
        audit(c, 'campaign.test', 'campaign', cmp.id, { to, status: out.status });
        return { ...out, sandbox: false };
      }
      case 'send': {
        if (body.confirm !== true) fail(400, 'Confirmation explicite requise.');
        if (!settings.realSendingEnabled) fail(412, 'Les envois réels ne sont pas encore activés : vérifiez l\'adresse d\'expédition, SPF, DKIM, DMARC, envoyez un e-mail de test et relisez la politique de confidentialité (Paramètres → Envoi).');
        if (!['draft', 'scheduled', 'cancelled'].includes(cmp.status)) fail(409, `Impossible : la campagne est « ${cmp.status} ».`);
        const n = eligible(db, cmp.audience).length; if (!n) fail(400, 'Aucun destinataire éligible (abonnés confirmés uniquement).');
        if (body.mode === 'schedule') {
          const when = new Date(body.scheduledAt); if (isNaN(+when) || +when < Date.now() + 60e3) fail(400, 'La date programmée doit être dans le futur (au moins 1 minute).');
          Object.assign(cmp, { status: 'scheduled', scheduled_at: when.toISOString(), timezone: body.timezone || 'Europe/Paris', updated_at: now() });
        } else Object.assign(cmp, { status: 'queued', scheduled_at: now(), timezone: body.timezone || 'Europe/Paris', updated_at: now() });
        db.touch('Campagnes'); audit(c, body.mode === 'schedule' ? 'campaign.schedule' : 'campaign.send_now', 'campaign', cmp.id, { recipients: n });
        return { campaign: cmp, recipients: n };
      }
      case 'cancel': {
        if (['scheduled', 'queued'].includes(cmp.status)) cmp.status = 'cancelled';
        else if (cmp.status === 'sending') { for (const x of db.all('Destinataires')) if (x.campaign_id === cmp.id && x.status === 'pending') { x.status = 'skipped'; x.last_error = 'Envoi interrompu par l\'administrateur'; } db.touch('Destinataires'); cmp.status = 'cancelled'; cmp.finished_at = now(); }
        else fail(409, `Une campagne « ${cmp.status} » ne peut pas être annulée.`);
        cmp.updated_at = now(); db.touch('Campagnes'); audit(c, 'campaign.cancel', 'campaign', cmp.id); return cmp;
      }
      case 'unschedule': if (cmp.status !== 'scheduled') fail(409, 'Cette campagne n\'est pas programmée.'); cmp.status = 'draft'; db.touch('Campagnes'); return cmp;
    }
  }
  if ((r = m(/^\/api\/admin\/campaigns\/(\d+)$/))) {
    const cmp = db.find('Campagnes', r[1]) ?? fail(404, 'Campagne introuvable.');
    if (method === 'GET') return { campaign: cmp, stats: campaignStats(db, cmp.id) };
    if (method === 'DELETE') { if (!['draft', 'cancelled'].includes(cmp.status) || cmp.started_at) fail(409, 'Seuls les brouillons jamais envoyés peuvent être supprimés.'); db.set('Campagnes', db.all('Campagnes').filter((x) => x.id !== cmp.id)); audit(c, 'campaign.delete', 'campaign', cmp.id); return { ok: true }; }
    if (!['draft', 'scheduled', 'cancelled'].includes(cmp.status)) fail(409, 'Une campagne en cours ou envoyée ne peut plus être modifiée.');
    Object.assign(cmp, campaignFields(body), { status: 'draft', updated_at: now() }); db.touch('Campagnes'); return cmp;
  }

  // ─── Automatisations ───
  if (p === '/api/admin/automations') return { automations: db.all('Automatisations'), runs: [...db.all('Executions')].reverse().slice(0, 50) };
  if ((r = m(/^\/api\/admin\/automations\/(\w+)$/))) {
    need(c, 'admin'); const a = db.all('Automatisations').find((x) => x.key === r![1]) ?? fail(404, 'Automatisation inconnue.');
    a.enabled = Boolean(body.enabled); a.config = body.config ?? a.config; db.touch('Automatisations');
    audit(c, a.enabled ? 'automation.enable' : 'automation.disable', 'automation', a.key); return a;
  }

  // ─── Paramètres ───
  if (p === '/api/admin/settings' && method === 'GET') {
    const al = aliases(); const quota = googleQuota();
    return {
      settings, sandbox: false, publicUrl: siteUrl(), scriptUrl: scriptUrl(), siteKey: '', bounceWebhookConfigured: true, backend: 'google',
      smtp: { mode: 'google', dnsRequired: dnsRequired(settings.sender.fromEmail), account: accountEmail(), aliases: al, fromAllowed: canSendAs(settings.sender.fromEmail), gmailApi: gmailApiAvailable(), remainingQuota: quota, sentToday: sentToday(db), maxPerDay: settings.sending.maxPerDay },
    };
  }
  if (p === '/api/admin/settings/smtp/verify') {
    need(c, 'admin');
    const okAlias = canSendAs(settings.sender.fromEmail);
    const message = okAlias ? `L'adresse ${settings.sender.fromEmail} est bien configurée dans Gmail « Envoyer des e-mails en tant que » (compte ${accountEmail()}).` : `L'adresse ${settings.sender.fromEmail} n'est pas encore configurée dans Gmail : Paramètres Gmail → Comptes → « Envoyer des e-mails en tant que » (serveur smtp.ionos.fr).`;
    saveSettings({ ...settings, smtpCheck: { ok: okAlias, checkedAt: now(), message } });
    return { ok: okAlias, message };
  }
  if (p === '/api/admin/settings/domain/check') { need(c, 'admin'); const d = checkDomain(settings.sender.fromEmail, settings.dkimSelector); saveSettings({ ...settings, domainCheck: { checkedAt: d.checkedAt, spf: d.spf, dkim: d.dkim, dmarc: d.dmarc, details: d.details } }); audit(c, 'settings.domain_check', 'settings', d.domain); return d; }
  if (p === '/api/admin/settings/real-sending') {
    need(c, 'admin');
    if (body.enabled) {
      const missing = [!settings.smtpCheck.ok && 'adresse d\'expédition configurée dans Gmail', ...(dnsRequired(settings.sender.fromEmail) ? [!settings.domainCheck.spf && 'SPF', !settings.domainCheck.dkim && 'DKIM', !settings.domainCheck.dmarc && 'DMARC'] : []), !settings.testEmail.sentAt && 'e-mail de test accepté', !settings.privacyPolicy.reviewed && 'politique de confidentialité relue'].filter(Boolean);
      if (missing.length) fail(412, `Vérifications manquantes : ${missing.join(', ')}.`);
    }
    saveSettings({ ...settings, realSendingEnabled: Boolean(body.enabled) }); audit(c, body.enabled ? 'settings.real_sending_on' : 'settings.real_sending_off', 'settings', 'sending');
    return { ok: true, enabled: Boolean(body.enabled) };
  }
  if (p === '/api/admin/settings/dns-guide') return { domain: 'sanctimaps.fr', records: [
    { type: 'CNAME', name: 'newsletter', value: 'sanctimaps-gif.github.io', purpose: 'Sous-domaine du studio, servi par GitHub Pages (ne touche pas sanctimaps.fr ni www).' },
    { type: 'TXT', name: '@', value: 'v=spf1 include:_spf-eu.ionos.com ~all (valeur exacte à vérifier dans la zone IONOS)', purpose: 'SPF : un seul enregistrement v=spf1 ; IONOS le crée en général avec la boîte mail.' },
    { type: 'CNAME / TXT', name: `${settings.dkimSelector || '<sélecteur>'}._domainkey`, value: 'fourni par IONOS (signature DKIM de la messagerie)', purpose: 'DKIM : signature des messages envoyés par le SMTP IONOS.' },
    { type: 'TXT', name: '_dmarc', value: `v=DMARC1; p=none; rua=mailto:${settings.sender.fromEmail}; adkim=r; aspf=r`, purpose: 'DMARC : commencer en p=none, durcir après quelques semaines.' },
  ] };
  if ((r = m(/^\/api\/admin\/settings\/(\w+)$/))) {
    need(c, 'admin'); const section = r[1];
    if (!(section in DEFAULT_SETTINGS) || ['smtpCheck', 'domainCheck', 'testEmail', 'realSendingEnabled'].includes(section)) fail(404, 'Section inconnue.');
    if (section === 'sender' && !senderAllowed(body.fromEmail)) fail(400, `L'adresse doit être ${accountEmail()} ou une adresse @sanctimaps.fr configurée dans Gmail.`);
    const next: any = { ...settings, [section]: body };
    if (section === 'sender') next.realSendingEnabled = false;
    saveSettings(next); audit(c, 'settings.update', 'settings', section);
    return next;
  }

  // ─── Journaux, comptes ───
  if (p === '/api/admin/logs/email') return [...db.all('Journal')].reverse().slice(0, 100).map((l) => ({ ...l, sandbox: false }));
  if (p === '/api/admin/logs/audit') { need(c, 'admin'); const users = new Map(db.all('Comptes').map((u) => [u.id, u.display_name])); return [...db.all('Audit')].reverse().slice(0, 200).map((a) => ({ ...a, display_name: users.get(a.user_id) ?? null })); }
  if (p === '/api/admin/jobs') {
    const hb = props().getProperty('HEARTBEAT'); const rs = db.all('Destinataires');
    const counts = ['pending', 'sending', 'accepted', 'bounced', 'failed', 'uncertain'].map((s) => ({ job_type: 'destinataires', status: s, n: rs.filter((x) => x.status === s).length })).filter((x) => x.n);
    return { counts, workerHeartbeat: hb ? JSON.parse(hb) : null };
  }
  if (p === '/api/admin/users') {
    need(c, 'admin');
    if (method === 'GET') return db.all('Comptes').map((u) => ({ id: u.id, email: u.email, display_name: u.display_name, role: u.role, totp_enabled: u.totp_enabled, last_login_at: u.last_login_at, created_at: u.created_at }));
    if (!isEmail(body.email)) fail(400, 'Adresse invalide.');
    if (db.all('Comptes').some((u) => u.email === String(body.email).toLowerCase())) fail(409, 'Ce compte existe déjà.');
    if (!['admin', 'editor', 'viewer'].includes(body.role)) fail(400, 'Rôle invalide.');
    const u = db.insert('Comptes', { email: String(body.email).toLowerCase(), display_name: cleanName(body.displayName) ?? 'Utilisateur', role: body.role, password_hash: hashPassword(passwordOk(body.password)), totp_secret: null, totp_enabled: false, failed_logins: 0, locked_until: null, last_login_at: null, created_at: now() });
    audit(c, 'user.create', 'user', u.id, { role: u.role }); return { id: u.id, email: u.email, display_name: u.display_name, role: u.role };
  }
  if ((r = m(/^\/api\/admin\/users\/(\d+)$/))) { need(c, 'admin'); if (Number(r[1]) === c.user.id) fail(400, 'Vous ne pouvez pas supprimer votre propre compte.'); db.set('Comptes', db.all('Comptes').filter((u) => u.id !== Number(r![1]))); audit(c, 'user.delete', 'user', r[1]); return { ok: true }; }
  if (p === '/api/admin/profile') { c.user.display_name = cleanName(body.displayName) ?? c.user.display_name; db.touch('Comptes'); return { ok: true }; }

  return fail(404, 'Introuvable.');
}

/** Données de départ : modèles et automatisations (une seule fois). */
export function seed(db: Db) {
  if (!db.all('Modeles').some((t) => t.is_system)) for (const t of starterTemplates()) db.insert('Modeles', { name: t.name, description: t.description, category: t.category, is_system: true, design: t.design, created_at: now(), updated_at: now() });
  const autos = db.all('Automatisations');
  for (const a of DEFAULT_AUTOMATIONS) if (!autos.some((x) => x.key === a.key)) db.insert('Automatisations', clone(a));
}
