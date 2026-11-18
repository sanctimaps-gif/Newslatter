import { z } from 'zod';
import { env } from '../config/env.ts';
import { emailHash, randomToken, sha256, truncateIp, unsubscribeToken } from '../lib/crypto.ts';
import { one, query, tx, type Queryable, pool } from '../lib/db.ts';
import { enqueue } from './queue.ts';

export const CONSENT_TEXT = "J'accepte de recevoir la lettre d'information de SanctiMaps (actualités de la carte des saints, saint du jour, nouveautés du site). Je peux me désinscrire à tout moment grâce au lien présent dans chaque e-mail.";
export const CONFIRMATION_TTL_HOURS = 48;

export const emailSchema = z.string().trim().toLowerCase().max(254).email('Adresse e-mail invalide');
export const nameSchema = z.string().trim().max(80).regex(/^[^<>{}\\]*$/, 'Caractères non autorisés').optional().nullable()
  .transform((v) => (v ? v : null));

export const STATUSES = ['pending', 'confirmed', 'unsubscribed', 'bounced', 'suspended'] as const;
export type SubscriberStatus = typeof STATUSES[number];

export interface Subscriber {
  id: number; email: string; first_name: string | null; last_name: string | null; status: SubscriberStatus;
  source: string; tags: string[]; subscribed_at: string; confirmed_at: string | null; unsubscribed_at: string | null;
  bounce_count: number; anonymized_at: string | null; notes: string | null; created_at: string;
}

export async function isSuppressed(email: string, client: Queryable = pool): Promise<string | null> {
  const r = await one<{ reason: string }>('SELECT reason FROM suppressions WHERE email_hash=$1', [emailHash(email)], client);
  return r?.reason ?? null;
}

export async function addSuppression(email: string, reason: string, client: Queryable = pool) {
  await query(`INSERT INTO suppressions(email_hash, reason) VALUES ($1,$2)
    ON CONFLICT (email_hash) DO UPDATE SET reason = CASE WHEN suppressions.reason IN ('complaint','erasure') THEN suppressions.reason ELSE EXCLUDED.reason END`,
  [emailHash(email), reason], client);
}

export function unsubscribeUrl(subscriberId: number) {
  return `${env.PUBLIC_URL}/desinscription?t=${encodeURIComponent(unsubscribeToken(subscriberId))}`;
}
export function oneClickUnsubscribeUrl(subscriberId: number) {
  return `${env.PUBLIC_URL}/api/public/unsubscribe/one-click?t=${encodeURIComponent(unsubscribeToken(subscriberId))}`;
}

async function createConfirmationToken(subscriberId: number, client: Queryable): Promise<string> {
  const token = randomToken(32);
  await query(`UPDATE confirmation_tokens SET used_at = now() WHERE subscriber_id=$1 AND used_at IS NULL`, [subscriberId], client); // un seul jeton valide
  await query(`INSERT INTO confirmation_tokens(subscriber_id, token_hash, expires_at) VALUES ($1,$2, now() + ($3 || ' hours')::interval)`,
    [subscriberId, sha256(token), String(CONFIRMATION_TTL_HOURS)], client);
  return token;
}

export interface SubscribeInput { email: string; firstName?: string | null; source: string; ip?: string; userAgent?: string }

/**
 * Demande d'inscription (double opt-in). Réponse volontairement identique quel que soit
 * l'état de l'adresse, pour ne pas révéler qui est abonné.
 */
export async function requestSubscription(input: SubscribeInput): Promise<{ action: 'created' | 'resent' | 'throttled' | 'already' | 'ignored' }> {
  const email = emailSchema.parse(input.email);
  const firstName = nameSchema.parse(input.firstName ?? null);
  return tx(async (c) => {
    const existing = await one<Subscriber>('SELECT * FROM subscribers WHERE email=$1 FOR UPDATE', [email], c);
    const consent = async (id: number, action: string) => query(
      `INSERT INTO consent_records(subscriber_id, action, consent_text, source, ip_truncated, user_agent) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, action, CONSENT_TEXT, input.source, truncateIp(input.ip), (input.userAgent ?? '').slice(0, 300)], c);

    if (!existing) {
      const s = await one<{ id: number }>(`INSERT INTO subscribers(email, first_name, status, source) VALUES ($1,$2,'pending',$3) RETURNING id`, [email, firstName, input.source], c);
      await consent(s!.id, 'request');
      const token = await createConfirmationToken(s!.id, c);
      await enqueue('email.confirmation', { subscriberId: s!.id, token }, {}, c);
      return { action: 'created' as const };
    }
    if (existing.status === 'confirmed') return { action: 'already' as const };
    if (existing.status === 'suspended' || existing.anonymized_at) return { action: 'ignored' as const };
    // Anti-abus : un seul e-mail de confirmation toutes les 2 minutes par adresse
    const recent = await one(`SELECT 1 FROM confirmation_tokens WHERE subscriber_id=$1 AND created_at > now() - interval '2 minutes'`, [existing.id], c);
    if (recent) return { action: 'throttled' as const };
    if (firstName && !existing.first_name) await query('UPDATE subscribers SET first_name=$2, updated_at=now() WHERE id=$1', [existing.id, firstName], c);
    // Une adresse désinscrite n'est PAS réactivée ici : elle le sera seulement si la personne clique sur le lien.
    await consent(existing.id, existing.status === 'pending' ? 'request' : 'resubscribe_request');
    const token = await createConfirmationToken(existing.id, c);
    await enqueue('email.confirmation', { subscriberId: existing.id, token }, {}, c);
    return { action: 'resent' as const };
  });
}

export async function confirmSubscription(token: string, meta: { ip?: string; userAgent?: string } = {}): Promise<{ ok: true; firstName: string | null } | { ok: false; reason: 'invalid' | 'expired' | 'used' }> {
  if (!token || token.length > 100) return { ok: false, reason: 'invalid' };
  return tx(async (c) => {
    const t = await one<{ id: number; subscriber_id: number; expires_at: Date; used_at: Date | null }>(
      'SELECT * FROM confirmation_tokens WHERE token_hash=$1 FOR UPDATE', [sha256(token)], c);
    if (!t) return { ok: false as const, reason: 'invalid' as const };
    if (t.used_at) return { ok: false as const, reason: 'used' as const };
    if (new Date(t.expires_at) < new Date()) return { ok: false as const, reason: 'expired' as const };
    await query('UPDATE confirmation_tokens SET used_at=now() WHERE id=$1', [t.id], c);
    const s = await one<Subscriber>(`UPDATE subscribers SET status='confirmed', confirmed_at=now(), unsubscribed_at=NULL, updated_at=now()
      WHERE id=$1 AND status IN ('pending','unsubscribed') AND anonymized_at IS NULL RETURNING *`, [t.subscriber_id], c);
    if (!s) return { ok: false as const, reason: 'invalid' as const };
    await query(`INSERT INTO consent_records(subscriber_id, action, consent_text, source, ip_truncated, user_agent) VALUES ($1,'confirm',$2,$3,$4,$5)`,
      [s.id, CONSENT_TEXT, s.source, truncateIp(meta.ip), (meta.userAgent ?? '').slice(0, 300)], c);
    // Nouvelle action explicite et confirmée de la personne : l'exclusion « désinscription » est levée.
    await query(`DELETE FROM suppressions WHERE email_hash=$1 AND reason IN ('unsubscribe','manual')`, [emailHash(s.email)], c);
    await enqueue('automation.on_confirm', { subscriberId: s.id }, {}, c);
    return { ok: true as const, firstName: s.first_name };
  });
}

export async function unsubscribe(subscriberId: number, method: string, campaignId?: number | null, client?: Queryable): Promise<Subscriber | null> {
  const run = async (c: Queryable) => {
    const s = await one<Subscriber>(`UPDATE subscribers SET status='unsubscribed', unsubscribed_at=COALESCE(unsubscribed_at, now()), updated_at=now()
      WHERE id=$1 AND status <> 'unsubscribed' RETURNING *`, [subscriberId], c);
    if (!s) return one<Subscriber>('SELECT * FROM subscribers WHERE id=$1', [subscriberId], c);
    await addSuppression(s.email, 'unsubscribe', c);
    await query(`INSERT INTO consent_records(subscriber_id, action, source) VALUES ($1,'unsubscribe',$2)`, [s.id, method], c);
    // Exclusion immédiate des envois en attente
    await query(`UPDATE campaign_recipients SET status='unsubscribed', updated_at=now() WHERE subscriber_id=$1 AND status='pending'`, [s.id], c);
    if (campaignId) {
      await query(`INSERT INTO campaign_events(campaign_id, subscriber_id, event_type, detail) VALUES ($1,$2,'unsubscribe',$3)`, [campaignId, s.id, JSON.stringify({ method })], c);
    }
    return s;
  };
  return client ? run(client) : tx(run);
}

export async function lastCampaignFor(subscriberId: number): Promise<number | null> {
  const r = await one<{ campaign_id: number }>(`SELECT campaign_id FROM campaign_recipients WHERE subscriber_id=$1 AND status='accepted' ORDER BY sent_at DESC NULLS LAST LIMIT 1`, [subscriberId]);
  return r?.campaign_id ?? null;
}

/** Droit à l'effacement : anonymisation + exclusion par empreinte (pour éviter une réimportation). */
export async function anonymize(subscriberId: number): Promise<boolean> {
  return tx(async (c) => {
    const s = await one<Subscriber>('SELECT * FROM subscribers WHERE id=$1 FOR UPDATE', [subscriberId], c);
    if (!s || s.anonymized_at) return false;
    await addSuppression(s.email, 'erasure', c);
    await query(`UPDATE subscribers SET email=$2, first_name=NULL, last_name=NULL, notes=NULL, tags='{}', status='unsubscribed',
      unsubscribed_at=COALESCE(unsubscribed_at, now()), anonymized_at=now(), updated_at=now() WHERE id=$1`,
    [s.id, `anonyme-${s.id}-${randomToken(6)}@anonymise.invalid`], c);
    await query(`UPDATE campaign_recipients SET email='anonymise', status=CASE WHEN status='pending' THEN 'skipped' ELSE status END WHERE subscriber_id=$1`, [s.id], c);
    await query(`UPDATE email_logs SET to_email='anonymise' WHERE to_email=$1`, [s.email], c);
    await query(`UPDATE consent_records SET ip_truncated=NULL, user_agent=NULL WHERE subscriber_id=$1`, [s.id], c);
    await query('DELETE FROM confirmation_tokens WHERE subscriber_id=$1', [s.id], c);
    return true;
  });
}

/** Droit d'accès / portabilité : export complet des données d'un abonné. */
export async function exportSubscriberData(subscriberId: number) {
  const s = await one<Subscriber>('SELECT * FROM subscribers WHERE id=$1', [subscriberId]);
  if (!s) return null;
  const consents = await query('SELECT action, consent_text, source, ip_truncated, user_agent, created_at FROM consent_records WHERE subscriber_id=$1 ORDER BY created_at', [subscriberId]);
  const campaigns = await query(`SELECT c.name, c.subject, r.status, r.sent_at FROM campaign_recipients r JOIN campaigns c ON c.id=r.campaign_id WHERE r.subscriber_id=$1 ORDER BY r.sent_at`, [subscriberId]);
  const events = await query(`SELECT e.event_type, e.created_at, c.name AS campaign FROM campaign_events e LEFT JOIN campaigns c ON c.id=e.campaign_id WHERE e.subscriber_id=$1 ORDER BY e.created_at`, [subscriberId]);
  return {
    generated_at: new Date().toISOString(),
    controller: 'SanctiMaps — https://sanctimaps.fr/',
    subscriber: { email: s.email, first_name: s.first_name, last_name: s.last_name, status: s.status, source: s.source, tags: s.tags, subscribed_at: s.subscribed_at, confirmed_at: s.confirmed_at, unsubscribed_at: s.unsubscribed_at },
    consent_records: consents, campaigns_received: campaigns, events,
  };
}
