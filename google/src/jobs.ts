// Tâche périodique (déclencheur toutes les 5 minutes) : programmation, envoi par lots, rebonds, tâches quotidiennes.
// Garantie anti-doublon : chaque destinataire passe à « sending » et est ENREGISTRÉ avant l'envoi ;
// un destinataire resté « sending » après une interruption devient « uncertain » et n'est jamais renvoyé.
import { Db, openBook } from './db';
import { googleQuota, sendMail, sentToday } from './mail';
import { applyDeliveryEvent, listUnsubscribeHeaders, prepareCampaign, renderForRecipient } from './router';
import { getSettings, props } from './settings';
import { transactional } from './templates';

const now = () => new Date().toISOString();
const MAX_RUN_MS = 4.5 * 60 * 1000;

function withLock<T>(fn: (db: Db) => T): T {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { const db = new Db(openBook()); const r = fn(db); db.flush(); SpreadsheetApp.flush(); return r; }
  finally { lock.releaseLock(); }
}

export function processQueue(started = Date.now()) {
  // 1. Promotion des campagnes programmées échues, préparation, reprise après interruption
  withLock((db) => {
    for (const c of db.all('Campagnes')) {
      if (c.status === 'scheduled' && new Date(c.scheduled_at) <= new Date()) { c.status = 'queued'; c.updated_at = now(); db.touch('Campagnes'); }
      if (c.status === 'queued') prepareCampaign(db, c);
    }
    for (const r of db.all('Destinataires')) {
      if (r.status === 'sending' && +new Date(r.updated_at) < Date.now() - 15 * 60e3) {
        r.status = 'uncertain'; r.last_error = 'Interruption pendant l\'envoi : statut inconnu, non renvoyé pour éviter un doublon'; r.updated_at = now(); db.touch('Destinataires');
      }
    }
  });

  // 2. Envoi par lots
  const settings = getSettings();
  let sent = 0;
  while (Date.now() - started < MAX_RUN_MS) {
    if (settings.sendingPaused) break;
    const batch = withLock((db) => {
      const budget = Math.min(settings.sending.maxPerDay - sentToday(db), googleQuota() ?? Infinity, settings.sending.batchSize);
      if (budget <= 0) return [];
      const sending = new Set(db.all('Campagnes').filter((c) => c.status === 'sending').map((c) => c.id));
      const picked = db.all('Destinataires').filter((r) => sending.has(r.campaign_id) && r.status === 'pending').slice(0, budget);
      for (const r of picked) { r.status = 'sending'; r.attempts = (r.attempts ?? 0) + 1; r.updated_at = now(); }
      if (picked.length) db.touch('Destinataires');
      return picked.map((r) => r.id);
    });
    if (!batch.length) break;
    withLock((db) => {
      for (const id of batch) {
        const r = db.find('Destinataires', id); const camp = db.find('Campagnes', r.campaign_id); const sub = db.find('Abonnes', r.subscriber_id);
        if (!sub || sub.status !== 'confirmed') { r.status = sub?.status === 'unsubscribed' ? 'unsubscribed' : 'skipped'; r.last_error = 'Exclu : abonné non confirmé au moment de l\'envoi'; db.touch('Destinataires'); continue; }
        const html = renderForRecipient(db, camp, sub, r);
        const out = sendMail(db, { to: sub.email, subject: camp.subject, html: html.html, text: html.text, fromName: camp.from_name, fromEmail: camp.from_email, replyTo: camp.reply_to ?? undefined, headers: listUnsubscribeHeaders(sub.id, camp.id), kind: 'campaign', campaignId: camp.id });
        r.updated_at = now();
        if (out.status === 'accepted') { r.status = 'accepted'; r.message_id = out.messageId; r.sent_at = now(); r.last_error = null; db.insert('Evenements', { campaign_id: camp.id, recipient_id: r.id, subscriber_id: sub.id, event_type: 'accepted', link_id: null, detail: null, created_at: now() }); sent++; }
        else if (out.status === 'hard_bounce') applyDeliveryEvent(db, 'hard_bounce', sub.email, out.error, r);
        else if (out.status === 'quota') { r.status = 'pending'; r.attempts -= 1; r.last_error = 'Quota Gmail du jour atteint : reprise demain'; }
        else if (r.attempts < settings.sending.maxAttempts) { r.status = 'pending'; r.last_error = out.error; }
        else { r.status = 'failed'; r.last_error = out.error; db.insert('Evenements', { campaign_id: camp.id, recipient_id: r.id, subscriber_id: sub.id, event_type: 'failed', link_id: null, detail: { error: out.error }, created_at: now() }); }
        db.touch('Destinataires');
      }
    });
  }

  // 3. Campagnes terminées
  withLock((db) => {
    for (const c of db.all('Campagnes').filter((x) => x.status === 'sending')) {
      const left = db.all('Destinataires').some((r) => r.campaign_id === c.id && (r.status === 'pending' || r.status === 'sending'));
      if (!left) { c.status = 'sent'; c.finished_at = now(); c.updated_at = now(); db.touch('Campagnes'); }
    }
  });

  // 4. Rebonds reçus dans la boîte Gmail, puis tâches quotidiennes
  scanBounces();
  const day = now().slice(0, 10);
  if (props().getProperty('LAST_DAILY') !== day) { daily(); props().setProperty('LAST_DAILY', day); }
  props().setProperty('HEARTBEAT', JSON.stringify({ at: now(), workerId: 'Déclencheur Google (5 min)', sandbox: false }));
  return { sent };
}

/** Lit les avis de non-distribution (mailer-daemon) reçus dans Gmail et met à jour les abonnés. */
export function scanBounces() {
  let threads: any[] = [];
  try { threads = GmailApp.search('from:(mailer-daemon OR postmaster) newer_than:7d -label:newsletter-rebonds-traites', 0, 50); } catch { return 0; }
  if (!threads.length) return 0;
  const label = GmailApp.getUserLabelByName('newsletter-rebonds-traites') ?? GmailApp.createLabel('newsletter-rebonds-traites');
  let n = 0;
  withLock((db) => {
    const byEmail = new Map(db.all('Abonnes').map((s) => [s.email, s]));
    for (const t of threads) {
      for (const msg of t.getMessages()) {
        const body = String(msg.getPlainBody() ?? '');
        const failed = String(msg.getHeader?.('X-Failed-Recipients') ?? '').toLowerCase().split(/[,\s]+/).filter(Boolean);
        const candidates = failed.length ? failed : [...new Set((body.toLowerCase().match(/[^\s<>()"',;:]+@[^\s<>()"',;:]+\.[a-z]{2,}/g) ?? []))].filter((e) => byEmail.has(e));
        const hard = /\b5\.\d\.\d+\b|\b55\d\b|does not exist|user unknown|address not found|n'existe pas|introuvable|no such user/i.test(body);
        for (const email of candidates) {
          if (!byEmail.has(email)) continue;
          const rcpt = db.all('Destinataires').filter((r) => r.email === email && r.status === 'accepted').sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))[0];
          applyDeliveryEvent(db, hard ? 'hard_bounce' : 'soft_bounce', email, body.slice(0, 300), rcpt);
          n++;
        }
      }
      t.addLabel(label);
    }
  });
  return n;
}

export function daily() {
  withLock((db) => {
    const autos = db.all('Automatisations');
    const log = (key: string, status: string, detail: object) => db.insert('Executions', { automation_key: key, status, detail, created_at: now() });
    const purge = autos.find((a) => a.key === 'purge_unconfirmed' && a.enabled);
    if (purge) {
      const limit = Date.now() - Number(purge.config.days ?? 30) * 86400e3;
      const before = db.all('Abonnes').length;
      const keep = db.all('Abonnes').filter((s) => !(s.status === 'pending' && !s.confirmed_at && +new Date(s.created_at) < limit));
      db.set('Abonnes', keep); log('purge_unconfirmed', 'ok', { deleted: before - keep.length });
    }
    const inactive = autos.find((a) => a.key === 'inactive_subscribers' && a.enabled);
    if (inactive) {
      const limit = Date.now() - Number(inactive.config.months ?? 12) * 30 * 86400e3;
      const n = db.all('Abonnes').filter((s) => s.status === 'confirmed' && +new Date(s.confirmed_at) < limit && (!s.last_activity_at || +new Date(s.last_activity_at) < limit)).length;
      log('inactive_subscribers', 'ok', { inactive: n, note: 'Signalement uniquement' });
    }
    const reminder = autos.find((a) => a.key === 'editorial_reminder' && a.enabled);
    if (reminder) {
      const days = Number(reminder.config.days ?? 7);
      const recent = db.all('Campagnes').some((c) => ['scheduled', 'queued', 'sending'].includes(c.status) || (c.status === 'sent' && +new Date(c.finished_at) > Date.now() - days * 86400e3));
      const to = String(reminder.config.to || '') || db.all('Comptes').find((u) => u.role === 'admin')?.email;
      if (!recent && to) { transactional(db, to, 'Rappel : aucune lettre programmée', [['heading', { text: 'Aucune lettre programmée', fontSize: 24 }], ['text', { text: `Aucune lettre n'a été envoyée ni programmée depuis ${days} jours.` }]], 'admin_notification'); log('editorial_reminder', 'ok', { to }); }
      else log('editorial_reminder', 'skipped', { reason: recent ? 'Lettre programmée ou récente' : 'Aucun destinataire' });
    }
    const s = getSettings();
    const keepLogs = Date.now() - s.retention.logsMonths * 30 * 86400e3;
    db.set('Journal', db.all('Journal').filter((l) => +new Date(l.created_at) > keepLogs));
    db.set('Jetons', db.all('Jetons').filter((t) => +new Date(t.expires_at) > Date.now() - 7 * 86400e3));
  });
}
