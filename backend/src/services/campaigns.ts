import { collectLinks, renderEmail, type EmailDesign } from '../../../shared/src/index.ts';
import { env } from '../config/env.ts';
import { emailHash, hmac, safeEqual } from '../lib/crypto.ts';
import { one, query, tx, type Queryable, pool } from '../lib/db.ts';
import { enqueue } from './queue.ts';
import { getSettings } from './settings.ts';
import { oneClickUnsubscribeUrl, unsubscribeUrl } from './subscribers.ts';

export type Audience =
  | { type: 'all' }
  | { type: 'segment'; segmentId: number }
  | { type: 'rules'; sources?: string[]; tags?: string[]; confirmedAfter?: string; confirmedBefore?: string }
  | { type: 'selection'; subscriberIds: number[] };

export interface Campaign {
  id: number; name: string; subject: string; preheader: string | null; from_name: string; from_email: string; reply_to: string | null;
  newsletter_id: number | null; design: EmailDesign; audience: Audience; status: string; scheduled_at: string | null; timezone: string;
  started_at: string | null; finished_at: string | null; recipient_count: number | null; track_opens: boolean; created_at: string; updated_at: string;
}

/** Clause SQL des destinataires éligibles : uniquement confirmés, jamais anonymisés. */
async function audienceWhere(a: Audience, client: Queryable = pool): Promise<{ sql: string; params: unknown[] }> {
  const base = `s.status = 'confirmed' AND s.anonymized_at IS NULL`;
  let rules: any = null;
  if (a.type === 'segment') {
    const seg = await one<{ rules: any }>('SELECT rules FROM segments WHERE id=$1', [a.segmentId], client);
    if (!seg) throw new Error('Segment introuvable');
    rules = seg.rules;
  } else if (a.type === 'rules') rules = a;
  if (a.type === 'selection') {
    return { sql: `${base} AND s.id = ANY($1::bigint[])`, params: [a.subscriberIds.map(Number).filter(Number.isFinite)] };
  }
  if (!rules) return { sql: base, params: [] };
  const parts = [base]; const params: unknown[] = [];
  if (rules.sources?.length) { params.push(rules.sources); parts.push(`s.source = ANY($${params.length}::text[])`); }
  if (rules.tags?.length) { params.push(rules.tags); parts.push(`s.tags && $${params.length}::text[]`); }
  if (rules.confirmedAfter) { params.push(rules.confirmedAfter); parts.push(`s.confirmed_at >= $${params.length}`); }
  if (rules.confirmedBefore) { params.push(rules.confirmedBefore); parts.push(`s.confirmed_at <= $${params.length}`); }
  return { sql: parts.join(' AND '), params };
}

async function suppressedHashes(client: Queryable = pool): Promise<Set<string>> {
  const rows = await query<{ email_hash: string }>('SELECT email_hash FROM suppressions', [], client);
  return new Set(rows.map((r) => r.email_hash));
}

export async function eligibleRecipients(a: Audience, client: Queryable = pool) {
  const { sql, params } = await audienceWhere(a, client);
  const rows = await query<{ id: number; email: string; first_name: string | null }>(`SELECT s.id, s.email, s.first_name FROM subscribers s WHERE ${sql} ORDER BY s.id`, params, client);
  const supp = await suppressedHashes(client);
  return rows.filter((r) => !supp.has(emailHash(r.email)));
}

export async function countEligible(a: Audience): Promise<number> {
  return (await eligibleRecipients(a)).length;
}

// ─── Liens suivis ───
export function recipientToken(recipientId: number) {
  return `${recipientId.toString(36)}.${hmac(`rcpt:${recipientId}`).slice(0, 16)}`;
}
export function readRecipientToken(t: string): number | null {
  const [a, sig] = t.split('.');
  if (!a || !sig) return null;
  const id = parseInt(a, 36);
  if (!Number.isInteger(id) || id <= 0) return null;
  return safeEqual(hmac(`rcpt:${id}`).slice(0, 16), sig) ? id : null;
}

export interface RenderOptions { campaign: Pick<Campaign, 'id' | 'subject' | 'preheader' | 'design' | 'track_opens'>; subscriberId: number; firstName: string | null; recipientId?: number; links?: Map<string, number> }

export async function renderForRecipient(o: RenderOptions) {
  const settings = await getSettings();
  const track = settings.tracking.clicks && o.recipientId && o.links
    ? (url: string) => { const lid = o.links!.get(url); return lid ? `${env.PUBLIC_URL}/r/${recipientToken(o.recipientId!)}/${lid}` : url; }
    : undefined;
  return renderEmail(o.campaign.design, {
    subject: o.campaign.subject,
    preheader: o.campaign.preheader ?? undefined,
    firstName: o.firstName,
    unsubscribeUrl: unsubscribeUrl(o.subscriberId),
    privacyUrl: `${env.PUBLIC_URL}/confidentialite`,
    legalText: settings.organization.legalText,
    trackLink: track,
    openPixelUrl: o.campaign.track_opens && settings.tracking.opens && o.recipientId ? `${env.PUBLIC_URL}/r/o/${recipientToken(o.recipientId)}.gif` : undefined,
  });
}

export function listUnsubscribeHeaders(subscriberId: number, settingsReply?: string) {
  const mailto = settingsReply ? `, <mailto:${settingsReply}?subject=unsubscribe>` : '';
  return {
    'List-Unsubscribe': `<${oneClickUnsubscribeUrl(subscriberId)}>${mailto}`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'List-Id': 'La lettre de SanctiMaps <newsletter.sanctimaps.fr>',
  };
}

/** Passe une campagne en file (envoi immédiat) ou la programme. Le worker fera le reste. */
export async function queueCampaign(id: number, userId: number, when: Date | null, timezone: string) {
  return tx(async (c) => {
    const camp = await one<Campaign>('SELECT * FROM campaigns WHERE id=$1 FOR UPDATE', [id], c);
    if (!camp) throw Object.assign(new Error('Campagne introuvable'), { statusCode: 404 });
    if (!['draft', 'scheduled', 'cancelled'].includes(camp.status)) throw Object.assign(new Error(`Impossible : la campagne est « ${camp.status} ».`), { statusCode: 409 });
    if (!camp.design?.blocks?.length) throw Object.assign(new Error('La campagne n\'a pas de contenu.'), { statusCode: 400 });
    if (when && when.getTime() < Date.now() + 60_000) throw Object.assign(new Error('La date programmée doit être dans le futur (au moins 1 minute).'), { statusCode: 400 });
    if (when) {
      await query(`UPDATE campaigns SET status='scheduled', scheduled_at=$2, timezone=$3, confirmed_by=$4, updated_at=now() WHERE id=$1`, [id, when, timezone, userId], c);
    } else {
      await query(`UPDATE campaigns SET status='queued', scheduled_at=now(), timezone=$2, confirmed_by=$3, updated_at=now() WHERE id=$1`, [id, timezone, userId], c);
      await enqueue('campaign.prepare', { campaignId: id }, { dedupeKey: `prepare-${id}-${Date.now()}` }, c);
    }
    return one<Campaign>('SELECT * FROM campaigns WHERE id=$1', [id], c);
  });
}

/** Le worker appelle ceci pour les campagnes programmées arrivées à échéance. Transition atomique : jamais deux fois. */
export async function promoteDueCampaigns(): Promise<number[]> {
  return tx(async (c) => {
    const rows = await query<{ id: number }>(`UPDATE campaigns SET status='queued', updated_at=now()
      WHERE id IN (SELECT id FROM campaigns WHERE status='scheduled' AND scheduled_at <= now() FOR UPDATE SKIP LOCKED) RETURNING id`, [], c);
    for (const r of rows) await enqueue('campaign.prepare', { campaignId: r.id }, { dedupeKey: `prepare-${r.id}-sched` }, c);
    return rows.map((r) => r.id);
  });
}

/** Fige le contenu, crée les lignes destinataires (unicité campagne+abonné), puis lance les lots. Idempotent. */
export async function prepareCampaign(id: number): Promise<{ recipients: number } | null> {
  return tx(async (c) => {
    const camp = await one<Campaign>('SELECT * FROM campaigns WHERE id=$1 FOR UPDATE', [id], c);
    if (!camp || camp.status !== 'queued') return null;
    const recipients = await eligibleRecipients(camp.audience, c);
    for (let i = 0; i < recipients.length; i += 500) {
      const chunk = recipients.slice(i, i + 500);
      await query(`INSERT INTO campaign_recipients(campaign_id, subscriber_id, email)
        SELECT $1, x.id, x.email FROM unnest($2::bigint[], $3::text[]) AS x(id, email) ON CONFLICT (campaign_id, subscriber_id) DO NOTHING`,
      [id, chunk.map((r) => r.id), chunk.map((r) => r.email)], c);
    }
    for (const url of collectLinks(camp.design)) {
      await query('INSERT INTO campaign_links(campaign_id, url) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, url], c);
    }
    const total = await one<{ n: number }>('SELECT count(*)::int AS n FROM campaign_recipients WHERE campaign_id=$1', [id], c);
    const preview = renderEmail(camp.design, { subject: camp.subject, preheader: camp.preheader ?? undefined, firstName: null, unsubscribeUrl: '#', privacyUrl: `${env.PUBLIC_URL}/confidentialite`, legalText: (await getSettings()).organization.legalText });
    await query(`UPDATE campaigns SET status='sending', started_at=COALESCE(started_at, now()), recipient_count=$2, html_snapshot=$3, text_snapshot=$4, updated_at=now() WHERE id=$1`,
      [id, total!.n, preview.html, preview.text], c);
    await enqueue('campaign.send_batch', { campaignId: id }, { dedupeKey: `batch-${id}-0` }, c);
    return { recipients: total!.n };
  });
}

export async function cancelCampaign(id: number): Promise<Campaign | null> {
  return tx(async (c) => {
    const camp = await one<Campaign>('SELECT * FROM campaigns WHERE id=$1 FOR UPDATE', [id], c);
    if (!camp) return null;
    if (camp.status === 'scheduled' || camp.status === 'queued') {
      await query(`UPDATE campaigns SET status='cancelled', updated_at=now() WHERE id=$1`, [id], c);
    } else if (camp.status === 'sending') {
      // Arrêt : les messages pas encore partis ne partiront pas.
      await query(`UPDATE campaign_recipients SET status='skipped', last_error='Envoi interrompu par l''administrateur', updated_at=now() WHERE campaign_id=$1 AND status='pending'`, [id], c);
      await query(`UPDATE campaigns SET status='cancelled', finished_at=now(), updated_at=now() WHERE id=$1`, [id], c);
    } else {
      throw Object.assign(new Error(`Une campagne « ${camp.status} » ne peut pas être annulée.`), { statusCode: 409 });
    }
    await query(`UPDATE scheduled_jobs SET status='cancelled' WHERE status='pending' AND (payload->>'campaignId')::bigint = $1`, [id], c);
    return one<Campaign>('SELECT * FROM campaigns WHERE id=$1', [id], c);
  });
}

export async function campaignLinks(id: number): Promise<Map<string, number>> {
  const rows = await query<{ id: number; url: string }>('SELECT id, url FROM campaign_links WHERE campaign_id=$1', [id]);
  return new Map(rows.map((r) => [r.url, r.id]));
}

export async function campaignStats(id: number) {
  const r = await one<any>(`SELECT
      count(*)::int AS targeted,
      count(*) FILTER (WHERE status='accepted')::int AS accepted,
      count(*) FILTER (WHERE status='bounced')::int AS bounced,
      count(*) FILTER (WHERE status='failed')::int AS failed,
      count(*) FILTER (WHERE status IN ('pending','sending'))::int AS pending,
      count(*) FILTER (WHERE status='uncertain')::int AS uncertain,
      count(*) FILTER (WHERE status IN ('skipped','unsubscribed'))::int AS skipped
    FROM campaign_recipients WHERE campaign_id=$1`, [id]);
  const ev = await one<any>(`SELECT
      count(*) FILTER (WHERE event_type='click')::int AS clicks,
      count(DISTINCT recipient_id) FILTER (WHERE event_type='click')::int AS unique_clickers,
      count(DISTINCT recipient_id) FILTER (WHERE event_type='open')::int AS unique_opens,
      count(*) FILTER (WHERE event_type='unsubscribe')::int AS unsubscribes,
      count(*) FILTER (WHERE event_type='complaint')::int AS complaints,
      count(*) FILTER (WHERE event_type='bounce_hard')::int AS hard_bounces,
      count(*) FILTER (WHERE event_type='bounce_soft')::int AS soft_bounces
    FROM campaign_events WHERE campaign_id=$1`, [id]);
  const clickRate = r.accepted ? Math.round((ev.unique_clickers / r.accepted) * 1000) / 10 : null;
  const links = await query(`SELECT l.url, count(e.id)::int AS clicks FROM campaign_links l LEFT JOIN campaign_events e ON e.link_id=l.id AND e.event_type='click'
    WHERE l.campaign_id=$1 GROUP BY l.id ORDER BY clicks DESC`, [id]);
  return { ...r, ...ev, click_rate: clickRate, links };
}
