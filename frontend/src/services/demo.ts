// Mode démonstration (GitHub Pages) : l'interface fonctionne sans serveur.
// Les données sont enregistrées uniquement dans le navigateur (localStorage).
// Aucun e-mail n'est envoyé, aucun chiffre n'est inventé : les statistiques sont calculées sur ces données locales.
import { renderEmail, starterTemplates, type EmailDesign } from '@shared/index';
import privacyMd from '../../../database/seeds/politique-confidentialite.md?raw';

export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';

class DemoError extends Error { constructor(public status: number, message: string) { super(message); } }
const NO_SERVER = 'Démonstration : cette action nécessite le serveur de la plateforme (rien n\'est envoyé depuis GitHub Pages).';

interface Store {
  next: number;
  subscribers: any[]; consents: any[]; newsletters: any[]; templates: any[]; campaigns: any[]; media: any[]; segments: any[];
  settings: any; automations: any[];
}
const KEY = 'snl.demo.v1';
const now = () => new Date().toISOString();

const DEFAULT_SETTINGS = {
  sender: { fromName: 'SanctiMaps', fromEmail: 'newsletter@sanctimaps.fr', replyTo: '' },
  organization: { name: 'SanctiMaps', legalText: 'SanctiMaps — la carte mondiale des saints · sanctimaps.fr', contactEmail: '', website: 'https://sanctimaps.fr/' },
  sending: { batchSize: 50, batchDelayMs: 2000, maxPerHour: 1000, maxAttempts: 3 },
  tracking: { clicks: true, opens: false },
  dkimSelector: '',
  smtpCheck: { ok: false, checkedAt: null, message: 'Jamais vérifié' },
  domainCheck: { checkedAt: null, spf: false, dkim: false, dmarc: false, details: {} },
  testEmail: { sentAt: null, to: null },
  realSendingEnabled: false,
  privacyPolicy: { markdown: privacyMd, reviewed: false },
  retention: { unconfirmedDays: 30, logsMonths: 24 },
  timezone: 'Europe/Paris',
};
const AUTOMATIONS = [
  { key: 'admin_signup_notification', name: 'Notification d\'inscription', description: 'Prévient l\'administrateur par e-mail à chaque nouvelle inscription confirmée.', enabled: false, config: { to: '' } },
  { key: 'editorial_reminder', name: 'Relance éditoriale', description: 'Rappelle à l\'administrateur de préparer la prochaine lettre si aucune campagne n\'est programmée dans les N jours.', enabled: false, config: { days: 7, to: '' } },
  { key: 'inactive_subscribers', name: 'Abonnés inactifs', description: 'Signale (sans les supprimer) les abonnés confirmés sans aucun clic depuis N mois.', enabled: false, config: { months: 12 } },
  { key: 'purge_unconfirmed', name: 'Purge des inscriptions non confirmées', description: 'Supprime les inscriptions restées non confirmées après N jours (minimisation des données, RGPD).', enabled: true, config: { days: 30 } },
  { key: 'welcome_email', name: 'E-mail de bienvenue', description: 'Envoie un message de bienvenue juste après la confirmation de l\'inscription (message transactionnel, non publicitaire).', enabled: false, config: { subject: 'Bienvenue dans la lettre de SanctiMaps', body: 'Merci d\'avoir confirmé votre inscription. Vous recevrez désormais la lettre de SanctiMaps : un saint, un lieu, une histoire.' } },
];

function fresh(): Store {
  const templates = starterTemplates().map((t, i) => ({ id: i + 1, ...t, is_system: true, created_at: now(), updated_at: now() }));
  return { next: 100, subscribers: [], consents: [], newsletters: [], templates, campaigns: [], media: [], segments: [], settings: structuredClone(DEFAULT_SETTINGS), automations: structuredClone(AUTOMATIONS) };
}
let mem: Store | null = null;
function load(): Store {
  if (mem) return mem;
  try { const raw = localStorage.getItem(KEY); mem = raw ? JSON.parse(raw) : fresh(); } catch { mem = fresh(); }
  return mem!;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* stockage plein ou bloqué : les données restent en mémoire */ } }
const id = (s: Store) => ++s.next;
const user = { id: 1, email: 'demo@sanctimaps.fr', displayName: 'Démonstration', role: 'admin', totpEnabled: false };
const legal = (s: Store) => s.settings.organization.legalText;
const err = (status: number, m: string) => { throw new DemoError(status, m); };

function campaignStats() {
  return { targeted: 0, accepted: 0, bounced: 0, failed: 0, pending: 0, uncertain: 0, skipped: 0, clicks: 0, unique_clickers: 0, unique_opens: 0, unsubscribes: 0, complaints: 0, hard_bounces: 0, soft_bounces: 0, click_rate: null, links: [] };
}

function eligible(s: Store, a: any) {
  let rows = s.subscribers.filter((x) => x.status === 'confirmed');
  if (a?.type === 'selection') rows = rows.filter((x) => a.subscriberIds.includes(x.id));
  if (a?.type === 'rules' && a.sources?.length) rows = rows.filter((x) => a.sources.includes(x.source));
  if (a?.type === 'segment') { const seg = s.segments.find((g) => g.id === a.segmentId); if (seg?.rules?.sources?.length) rows = rows.filter((x) => seg.rules.sources.includes(x.source)); }
  return rows;
}

function period(q: URLSearchParams) {
  const p = q.get('period') ?? '30d';
  let from: Date; let to = new Date();
  if (p === 'custom' && q.get('from') && q.get('to')) { from = new Date(q.get('from')!); to = new Date(`${q.get('to')}T23:59:59`); }
  else from = new Date(Date.now() - ({ '7d': 7, '30d': 30, '90d': 90, '12m': 365 } as any)[p] * 86400000 || 30 * 86400000);
  const days = (+to - +from) / 86400000;
  const bucket = days > 120 ? 'month' : days > 45 ? 'week' : 'day';
  return { from, to, bucket };
}
function buckets(from: Date, to: Date, bucket: string) {
  const out: Date[] = []; const d = new Date(from); d.setHours(0, 0, 0, 0);
  if (bucket === 'month') d.setDate(1);
  while (d <= to) { out.push(new Date(d)); if (bucket === 'day') d.setDate(d.getDate() + 1); else if (bucket === 'week') d.setDate(d.getDate() + 7); else d.setMonth(d.getMonth() + 1); }
  return out;
}

function dashboard(s: Store, q: URLSearchParams) {
  const { from, to, bucket } = period(q);
  const inP = (v?: string | null) => v && new Date(v) >= from && new Date(v) <= to;
  const subs = s.subscribers;
  const bs = buckets(from, to, bucket);
  const growth = bs.map((b, i) => {
    const end = bs[i + 1] ?? new Date(+to + 1);
    const inB = (v?: string | null) => v && new Date(v) >= b && new Date(v) < end;
    return {
      date: b.toISOString().slice(0, 10),
      signups: subs.filter((x) => inB(x.created_at)).length,
      confirmations: subs.filter((x) => inB(x.confirmed_at)).length,
      unsubscribes: subs.filter((x) => inB(x.unsubscribed_at)).length,
      total: subs.filter((x) => x.confirmed_at && new Date(x.confirmed_at) < end && (!x.unsubscribed_at || new Date(x.unsubscribed_at) >= end)).length,
    };
  });
  const recentBy = (k: string) => [...subs].filter((x) => x[k]).sort((a, b) => +new Date(b[k]) - +new Date(a[k])).slice(0, 6);
  return {
    period: { from, to, bucket },
    totals: {
      confirmed: subs.filter((x) => x.status === 'confirmed').length, pending: subs.filter((x) => x.status === 'pending').length,
      new_confirmed: subs.filter((x) => inP(x.confirmed_at)).length, new_signups: subs.filter((x) => inP(x.created_at)).length,
      unsubscribed_period: subs.filter((x) => inP(x.unsubscribed_at)).length, unsubscribed_total: subs.filter((x) => x.status === 'unsubscribed').length,
      bounced_total: subs.filter((x) => x.status === 'bounced').length,
    },
    content: { newsletters: s.newsletters.length, campaigns_sent: 0, campaigns_scheduled: s.campaigns.filter((c) => c.status === 'scheduled').length, campaigns_sending: 0 },
    delivery: { accepted: 0, bounced: 0, failed: 0 }, clicks: { clicks: 0, unique_clickers: 0 },
    growth, activity: growth.map((g) => ({ date: g.date, accepted: 0, bounced: 0, clicks: 0 })), comparison: [],
    recent: {
      signups: recentBy('created_at'), unsubscribes: recentBy('unsubscribed_at'),
      campaigns: [...s.campaigns].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)).slice(0, 6),
      sends: [], errors: [], jobErrors: [],
    },
  };
}

function listSubscribers(s: Store, q: URLSearchParams) {
  let rows = [...s.subscribers];
  const term = (q.get('q') ?? '').toLowerCase();
  if (term) rows = rows.filter((x) => [x.email, x.first_name, x.last_name].some((v) => v?.toLowerCase().includes(term)));
  if (q.get('status')) rows = rows.filter((x) => x.status === q.get('status'));
  if (q.get('source')) rows = rows.filter((x) => x.source === q.get('source'));
  const sort = q.get('sort') ?? 'created_desc';
  const cmp: Record<string, (a: any, b: any) => number> = {
    created_desc: (a, b) => +new Date(b.created_at) - +new Date(a.created_at), created_asc: (a, b) => +new Date(a.created_at) - +new Date(b.created_at),
    email_asc: (a, b) => a.email.localeCompare(b.email), email_desc: (a, b) => b.email.localeCompare(a.email),
    name_asc: (a, b) => (a.first_name ?? '￿').localeCompare(b.first_name ?? '￿'), confirmed_desc: (a, b) => +new Date(b.confirmed_at ?? 0) - +new Date(a.confirmed_at ?? 0),
  };
  rows.sort(cmp[sort] ?? cmp.created_desc);
  const page = Number(q.get('page') ?? 1); const size = Number(q.get('pageSize') ?? 25);
  const counts: Record<string, number> = {};
  for (const x of s.subscribers) counts[x.status] = (counts[x.status] ?? 0) + 1;
  return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pageSize: size, counts };
}

function parseCsv(text: string) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const delim = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  return { delim, rows: lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''))) };
}
const norm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_-]+/g, ' ').trim();
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function readFile(f: File, asData = false): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; asData ? r.readAsDataURL(f) : r.readAsText(f); });
}

export async function demoApi(method: string, path: string, body: any, form?: FormData): Promise<any> {
  const s = load();
  const url = new URL(path, 'https://demo.local');
  const p = url.pathname; const q = url.searchParams;
  const m = (re: RegExp) => p.match(re);
  const find = (list: any[], i: string | number) => list.find((x) => x.id === Number(i)) ?? err(404, 'Introuvable.');
  const done = <T>(v: T) => { save(); return v; };
  let r: RegExpMatchArray | null;

  // ─── Authentification ───
  if (p === '/api/auth/me' || p === '/api/auth/login' || p === '/api/auth/2fa') return { user, csrfToken: 'demo' };
  if (p === '/api/auth/logout') return { ok: true };
  if (p === '/api/auth/password-reset/request') return { ok: true, message: 'Démonstration : aucun e-mail n\'est envoyé.' };
  if (p.startsWith('/api/auth/')) err(400, NO_SERVER);

  // ─── Public ───
  if (p === '/api/public/config') return { consentText: "J'accepte de recevoir la lettre d'information de SanctiMaps (actualités de la carte des saints, saint du jour, nouveautés du site). Je peux me désinscrire à tout moment grâce au lien présent dans chaque e-mail.", confirmationHours: 48, purpose: 'Recevoir la lettre d\'information de SanctiMaps : le saint du jour, les nouveaux lieux et saints ajoutés à la carte et les nouveautés du site. Environ une lettre par semaine.' };
  if (p === '/api/public/subscribe') {
    if (!isEmail(body?.email ?? '')) err(400, 'Adresse e-mail invalide.');
    const email = body.email.trim().toLowerCase();
    if (!s.subscribers.some((x) => x.email === email)) {
      const sub = { id: id(s), email, first_name: body.firstName || null, last_name: null, status: 'pending', source: 'formulaire', tags: [], subscribed_at: now(), confirmed_at: null, unsubscribed_at: null, created_at: now(), notes: null };
      s.subscribers.push(sub);
      s.consents.push({ subscriber_id: sub.id, action: 'request', consent_text: 'Case de consentement cochée (démonstration)', source: 'formulaire', created_at: now() });
    }
    return done({ ok: true, message: 'Démonstration : l\'inscription est enregistrée « en attente » dans votre navigateur. Sur le vrai serveur, un e-mail de confirmation serait envoyé.' });
  }
  if (p === '/api/public/confirm' || p.startsWith('/api/public/unsubscribe')) err(400, 'Démonstration : les liens de confirmation et de désinscription arrivent par e-mail, envoyé uniquement par le serveur.');
  if (p === '/api/public/privacy') return { markdown: s.settings.privacyPolicy.markdown, reviewed: false, contactEmail: '', organization: 'SanctiMaps' };

  // ─── Tableau de bord, statistiques ───
  if (p === '/api/admin/dashboard') return dashboard(s, q);
  if (p === '/api/admin/stats/campaigns') {
    const by: Record<string, number> = {};
    for (const x of s.subscribers.filter((y) => y.status === 'confirmed')) by[x.source] = (by[x.source] ?? 0) + 1;
    return { period: period(q), campaigns: [], totals: { targeted: 0, accepted: 0, bounced: 0, clickers: 0, clicks: 0, unsubscribes: 0, opens: 0 }, sources: Object.entries(by).map(([source, n]) => ({ source, n })), opensTracked: false };
  }

  // ─── Abonnés ───
  if (p === '/api/admin/subscribers' && method === 'GET') return listSubscribers(s, q);
  if (p === '/api/admin/subscribers/sources') return [...new Set(s.subscribers.map((x) => x.source))].sort();
  if (p === '/api/admin/subscribers' && method === 'POST') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!isEmail(email)) err(400, 'Adresse e-mail invalide');
    if (s.subscribers.some((x) => x.email === email)) err(409, 'Cette adresse existe déjà.');
    const sub = { id: id(s), email, first_name: body.firstName || null, last_name: body.lastName || null, status: 'pending', source: 'ajout-manuel', tags: body.tags ?? [], subscribed_at: now(), confirmed_at: null, unsubscribed_at: null, created_at: now(), notes: body.notes ?? null };
    s.subscribers.push(sub);
    s.consents.push({ subscriber_id: sub.id, action: 'admin_add', consent_text: body.consentNote || 'Ajout manuel', source: 'ajout-manuel', created_at: now() });
    return done(sub);
  }
  if ((r = m(/^\/api\/admin\/subscribers\/(\d+)\/export$/))) { const x = find(s.subscribers, r[1]); return { subscriber: x, consent_records: s.consents.filter((c) => c.subscriber_id === x.id) }; }
  if ((r = m(/^\/api\/admin\/subscribers\/(\d+)$/))) {
    const x = find(s.subscribers, r[1]);
    if (method === 'GET') return { subscriber: x, consents: s.consents.filter((c) => c.subscriber_id === x.id).reverse(), campaigns: [], events: [] };
    if (method === 'DELETE') { s.subscribers = s.subscribers.filter((y) => y.id !== x.id); return done({ ok: true }); }
    if (body.status === 'confirmed') err(400, 'Le statut « confirmé » ne peut pas être posé à la main.');
    Object.assign(x, { first_name: body.firstName ?? x.first_name, last_name: body.lastName ?? x.last_name, tags: body.tags ?? x.tags, notes: body.notes ?? x.notes });
    if (body.status === 'suspended') x.status = 'suspended';
    if (body.status === 'unsubscribed') { x.status = 'unsubscribed'; x.unsubscribed_at = now(); }
    if (body.status === 'restore') x.status = x.confirmed_at && !x.unsubscribed_at ? 'confirmed' : 'pending';
    return done(x);
  }
  if (p === '/api/admin/subscribers-export.csv') {
    const st = q.get('status') ?? 'confirmed';
    return ['email;prenom;nom;statut;source;inscription', ...s.subscribers.filter((x) => x.status === st).map((x) => [x.email, x.first_name ?? '', x.last_name ?? '', x.status, x.source, x.subscribed_at].join(';'))].join('\n');
  }
  if (p === '/api/admin/subscribers/import/preview') {
    const file = form?.get('file') as File | null;
    if (!file) err(400, 'Aucun fichier reçu.');
    if (!/\.(csv|txt)$/i.test(file!.name)) err(400, 'Le fichier doit être au format .csv.');
    const { delim, rows } = parseCsv(await readFile(file!));
    const head = rows[0].map(norm);
    const pick = (al: string[]) => head.findIndex((h) => al.includes(h));
    const mapping: Record<string, number> = {};
    const e = pick(['email', 'e mail', 'mail', 'courriel', 'adresse', 'adresse e mail', 'adresse email']); if (e >= 0) mapping.email = e;
    const f = pick(['prenom', 'first name', 'firstname']); if (f >= 0) mapping.first_name = f;
    const l = pick(['nom', 'last name', 'lastname', 'nom de famille']); if (l >= 0) mapping.last_name = l;
    let data = rows.slice(1);
    if (mapping.email === undefined) { const i = rows[0].findIndex(isEmail); if (i < 0) err(400, 'Aucune colonne « email » détectée.'); mapping.email = i; data = rows; }
    const seen = new Set<string>();
    const out = data.map((row, i) => {
      const email = (row[mapping.email] ?? '').toLowerCase();
      const status = !isEmail(email) ? 'invalid' : seen.has(email) ? 'duplicate_file' : s.subscribers.some((x) => x.email === email) ? 'exists' : 'ok';
      seen.add(email);
      return { line: i + 2, email, firstName: mapping.first_name !== undefined ? row[mapping.first_name] ?? '' : '', lastName: mapping.last_name !== undefined ? row[mapping.last_name] ?? '' : '', status, note: '' };
    });
    const summary = out.reduce((a: any, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }), {});
    return { filename: file!.name, delimiter: delim, columns: rows[0], mapping, summary, total: out.length, rows: out };
  }
  if (p === '/api/admin/subscribers/import/commit') {
    let imported = 0, skipped = 0;
    for (const row of body.rows) {
      const email = String(row.email).toLowerCase();
      if (!isEmail(email) || s.subscribers.some((x) => x.email === email)) { skipped++; continue; }
      const sub = { id: id(s), email, first_name: row.firstName || null, last_name: row.lastName || null, status: 'pending', source: `import:${body.sourceLabel}`, tags: [], subscribed_at: now(), confirmed_at: null, unsubscribed_at: null, created_at: now(), notes: null };
      s.subscribers.push(sub); s.consents.push({ subscriber_id: sub.id, action: 'import', consent_text: body.consentNote, source: sub.source, created_at: now() });
      imported++;
    }
    return done({ imported, skipped });
  }
  if (p === '/api/admin/segments') {
    if (method === 'GET') return s.segments;
    const seg = { id: id(s), name: body.name, rules: body.rules, created_at: now() }; s.segments.push(seg); return done(seg);
  }
  if ((r = m(/^\/api\/admin\/segments\/(\d+)$/))) { s.segments = s.segments.filter((x) => x.id !== Number(r![1])); return done({ ok: true }); }

  // ─── Newsletters ───
  if (p === '/api/admin/newsletters') {
    if (method === 'GET') return [...s.newsletters].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)).map((n) => ({ ...n, block_count: n.design.blocks.length, campaign_count: s.campaigns.filter((c) => c.newsletter_id === n.id).length }));
    const n = { id: id(s), title: body.title, design: body.design, template_id: body.templateId ?? null, created_at: now(), updated_at: now() }; s.newsletters.push(n); return done(n);
  }
  if ((r = m(/^\/api\/admin\/newsletters\/(\d+)\/duplicate$/))) { const n = find(s.newsletters, r[1]); const c = { ...structuredClone(n), id: id(s), title: `${n.title} (copie)`, created_at: now(), updated_at: now() }; s.newsletters.push(c); return done(c); }
  if ((r = m(/^\/api\/admin\/newsletters\/(\d+)$/))) {
    const n = find(s.newsletters, r[1]);
    if (method === 'GET') return n;
    if (method === 'DELETE') { s.newsletters = s.newsletters.filter((x) => x.id !== n.id); return done({ ok: true }); }
    Object.assign(n, { title: body.title, design: body.design, updated_at: now() }); return done(n);
  }

  // ─── Modèles ───
  if (p === '/api/admin/templates') {
    if (method === 'GET') return s.templates;
    const t = { id: id(s), name: body.name, description: body.description ?? '', category: 'personnalise', is_system: false, design: body.design, created_at: now(), updated_at: now() }; s.templates.push(t); return done(t);
  }
  if ((r = m(/^\/api\/admin\/templates\/(\d+)\/duplicate$/))) { const t = find(s.templates, r[1]); const c = { ...structuredClone(t), id: id(s), name: `${t.name} (copie)`, is_system: false }; s.templates.push(c); return done(c); }
  if ((r = m(/^\/api\/admin\/templates\/(\d+)$/))) {
    const t = find(s.templates, r[1]);
    if (method === 'GET') return t;
    if (method === 'DELETE') { s.templates = s.templates.filter((x) => x.id !== t.id); return done({ ok: true }); }
    Object.assign(t, { name: body.name, description: body.description, design: body.design, updated_at: now() }); return done(t);
  }

  // ─── Médias (images converties en données dans le navigateur) ───
  if (p === '/api/admin/media') {
    if (method === 'GET') return s.media;
    const file = form?.get('file') as File | null;
    if (!file || !/^image\/(png|jpeg|gif|webp)$/.test(file.type)) err(400, 'Format non autorisé : PNG, JPEG, GIF ou WebP uniquement.');
    if (file!.size > 1.5 * 1024 * 1024) err(400, 'Démonstration : image limitée à 1,5 Mo (stockage du navigateur).');
    const url = await readFile(file!, true);
    const media = { id: id(s), filename: file!.name, original_name: file!.name, url, width: null, height: null, alt_text: String(form?.get('alt') ?? ''), size_bytes: file!.size, created_at: now() };
    s.media.unshift(media); return done(media);
  }
  if ((r = m(/^\/api\/admin\/media\/(\d+)\/replace$/))) { const x = find(s.media, r[1]); const file = form?.get('file') as File; x.url = await readFile(file, true); x.original_name = file.name; x.size_bytes = file.size; return done(x); }
  if ((r = m(/^\/api\/admin\/media\/(\d+)$/))) {
    const x = find(s.media, r[1]);
    if (method === 'DELETE') { s.media = s.media.filter((y) => y.id !== x.id); return done({ ok: true }); }
    x.alt_text = body.alt; return done(x);
  }
  if (p === '/api/admin/render') return renderEmail(body.design as EmailDesign, { subject: body.subject ?? 'Aperçu', preheader: body.preheader, sampleData: body.sample ?? true, unsubscribeUrl: '#', privacyUrl: '#', legalText: legal(s) });

  // ─── Campagnes ───
  if (p === '/api/admin/audience/count') return { count: eligible(s, body.audience).length };
  if (p === '/api/admin/campaigns') {
    if (method === 'GET') {
      let rows = [...s.campaigns];
      if (q.get('status')) rows = rows.filter((c) => q.get('status')!.split(',').includes(c.status));
      return rows.sort((a, b) => +new Date(b.scheduled_at ?? b.created_at) - +new Date(a.scheduled_at ?? a.created_at)).map((c) => ({ ...c, accepted: 0, bounced: 0, clickers: 0 }));
    }
    if (!/@sanctimaps\.fr$/i.test(body.fromEmail)) err(400, 'L\'adresse d\'expédition doit appartenir au domaine sanctimaps.fr.');
    const c = { id: id(s), name: body.name, subject: body.subject, preheader: body.preheader, from_name: body.fromName, from_email: body.fromEmail, reply_to: body.replyTo || null, newsletter_id: body.newsletterId ?? null, design: body.design, audience: body.audience, track_opens: false, status: 'draft', scheduled_at: null, timezone: 'Europe/Paris', started_at: null, finished_at: null, recipient_count: null, created_at: now(), updated_at: now() };
    s.campaigns.push(c); return done(c);
  }
  if ((r = m(/^\/api\/admin\/campaigns\/(\d+)\/(test|send|cancel|unschedule|duplicate|recipients)$/))) {
    const c = find(s.campaigns, r[1]);
    switch (r[2]) {
      case 'test': return err(412, NO_SERVER);
      case 'recipients': return { rows: [], total: 0 };
      case 'duplicate': { const d = { ...structuredClone(c), id: id(s), name: `${c.name} (copie)`, status: 'draft', scheduled_at: null, created_at: now(), updated_at: now() }; s.campaigns.push(d); return done(d); }
      case 'cancel': c.status = 'cancelled'; c.updated_at = now(); return done(c);
      case 'unschedule': c.status = 'draft'; return done(c);
      case 'send': {
        if (body.mode === 'now') return err(412, NO_SERVER);
        const n = eligible(s, c.audience).length;
        if (!n) err(400, 'Aucun destinataire éligible (abonnés confirmés uniquement).');
        Object.assign(c, { status: 'scheduled', scheduled_at: body.scheduledAt, timezone: body.timezone, updated_at: now() });
        return done({ campaign: c, recipients: n });
      }
    }
  }
  if ((r = m(/^\/api\/admin\/campaigns\/(\d+)$/))) {
    const c = find(s.campaigns, r[1]);
    if (method === 'GET') return { campaign: c, stats: campaignStats() };
    if (method === 'DELETE') { s.campaigns = s.campaigns.filter((x) => x.id !== c.id); return done({ ok: true }); }
    Object.assign(c, { name: body.name, subject: body.subject, preheader: body.preheader, from_name: body.fromName, from_email: body.fromEmail, reply_to: body.replyTo || null, newsletter_id: body.newsletterId ?? null, design: body.design, audience: body.audience, status: 'draft', updated_at: now() });
    return done(c);
  }

  // ─── Automatisations, paramètres, journaux, comptes ───
  if (p === '/api/admin/automations') return { automations: s.automations, runs: [] };
  if ((r = m(/^\/api\/admin\/automations\/(\w+)$/))) { const a = s.automations.find((x) => x.key === r![1]) ?? err(404, 'Automatisation inconnue.'); Object.assign(a, { enabled: body.enabled, config: body.config }); return done(a); }
  if (p === '/api/admin/settings') return { settings: s.settings, smtp: { mode: 'sandbox', host: '— (aucun serveur en démonstration)', port: '—', user: '', passwordSet: false, security: 'none' }, sandbox: true, publicUrl: 'https://newsletter.sanctimaps.fr', siteKey: 'pk_sanctimaps_… (générée sur le serveur)', bounceWebhookConfigured: false };
  if (p === '/api/admin/settings/dns-guide') {
    return { domain: 'sanctimaps.fr', records: [
      { type: 'A', name: 'newsletter', value: '<IP publique du serveur>', purpose: 'Sous-domaine de la plateforme (ne touche pas sanctimaps.fr ni www).' },
      { type: 'TXT', name: '@', value: 'v=spf1 <mécanismes existants> include:<domaine SPF du relais> ~all', purpose: 'SPF : compléter l\'enregistrement EXISTANT.' },
      { type: 'TXT / CNAME', name: `${s.settings.dkimSelector || '<sélecteur>'}._domainkey`, value: '<clé publique fournie par le relais>', purpose: 'DKIM : signature des messages.' },
      { type: 'TXT', name: '_dmarc', value: 'v=DMARC1; p=none; rua=mailto:newsletter@sanctimaps.fr; adkim=r; aspf=r', purpose: 'DMARC : commencer en p=none.' },
    ] };
  }
  if ((r = m(/^\/api\/admin\/settings\/(smtp\/verify|domain\/check|real-sending)$/))) return err(412, NO_SERVER);
  if ((r = m(/^\/api\/admin\/settings\/(\w+)$/))) { s.settings[r[1]] = body; return done(s.settings); }
  if (p === '/api/admin/logs/email' || p === '/api/admin/logs/audit') return [];
  if (p === '/api/admin/jobs') return { counts: [], workerHeartbeat: null };
  if (p === '/api/admin/users') { if (method === 'GET') return [{ id: 1, email: user.email, display_name: user.displayName, role: 'admin', totp_enabled: false, last_login_at: now(), created_at: now() }]; return err(412, NO_SERVER); }
  if (p === '/api/admin/profile') return { ok: true };
  return err(404, 'Démonstration : fonction non disponible sans serveur.');
}

export function resetDemo() { mem = fresh(); save(); }
