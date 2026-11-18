// Toutes les statistiques sont calculées à partir des tables réelles. Aucune valeur inventée.
import { one, query } from '../lib/db.ts';

export interface Period { from: Date; to: Date; bucket: 'day' | 'week' | 'month' }

export function parsePeriod(p?: string, from?: string, to?: string): Period {
  const now = new Date();
  if (p === 'custom' && from && to) {
    const f = new Date(from); const t = new Date(to);
    if (!isNaN(+f) && !isNaN(+t) && f <= t) {
      t.setHours(23, 59, 59, 999);
      const days = (+t - +f) / 86400000;
      return { from: f, to: t, bucket: days > 120 ? 'month' : days > 45 ? 'week' : 'day' };
    }
  }
  const days = p === '7d' ? 7 : p === '90d' ? 90 : p === '12m' ? 365 : 30;
  return { from: new Date(+now - days * 86400000), to: now, bucket: days >= 365 ? 'month' : days >= 90 ? 'week' : 'day' };
}

export async function dashboard(period: Period) {
  const f = period.from; const t = period.to;
  const totals = await one<any>(`SELECT
      count(*) FILTER (WHERE status='confirmed')::int AS confirmed,
      count(*) FILTER (WHERE status='pending')::int AS pending,
      count(*) FILTER (WHERE confirmed_at BETWEEN $1 AND $2)::int AS new_confirmed,
      count(*) FILTER (WHERE created_at BETWEEN $1 AND $2)::int AS new_signups,
      count(*) FILTER (WHERE unsubscribed_at BETWEEN $1 AND $2)::int AS unsubscribed_period,
      count(*) FILTER (WHERE status='unsubscribed')::int AS unsubscribed_total,
      count(*) FILTER (WHERE status='bounced')::int AS bounced_total
    FROM subscribers`, [f, t]);
  const content = await one<any>(`SELECT
      (SELECT count(*)::int FROM newsletters) AS newsletters,
      (SELECT count(*)::int FROM campaigns WHERE status='sent') AS campaigns_sent,
      (SELECT count(*)::int FROM campaigns WHERE status='scheduled') AS campaigns_scheduled,
      (SELECT count(*)::int FROM campaigns WHERE status IN ('queued','sending')) AS campaigns_sending`);
  const delivery = await one<any>(`SELECT
      count(*) FILTER (WHERE status='accepted')::int AS accepted,
      count(*) FILTER (WHERE status='bounced')::int AS bounced,
      count(*) FILTER (WHERE status='failed')::int AS failed
    FROM campaign_recipients WHERE sent_at BETWEEN $1 AND $2 OR (status IN ('bounced','failed') AND updated_at BETWEEN $1 AND $2)`, [f, t]);
  const clicks = await one<any>(`SELECT count(*)::int AS clicks, count(DISTINCT recipient_id)::int AS unique_clickers
    FROM campaign_events WHERE event_type='click' AND created_at BETWEEN $1 AND $2`, [f, t]);

  const b = period.bucket;
  const growth = await query(`WITH days AS (SELECT generate_series(date_trunc('${b}', $1::timestamptz), date_trunc('${b}', $2::timestamptz), '1 ${b}'::interval) AS d)
    SELECT to_char(d, 'YYYY-MM-DD') AS date,
      (SELECT count(*)::int FROM subscribers s WHERE s.created_at >= d AND s.created_at < d + '1 ${b}'::interval) AS signups,
      (SELECT count(*)::int FROM subscribers s WHERE s.confirmed_at >= d AND s.confirmed_at < d + '1 ${b}'::interval) AS confirmations,
      (SELECT count(*)::int FROM subscribers s WHERE s.unsubscribed_at >= d AND s.unsubscribed_at < d + '1 ${b}'::interval) AS unsubscribes,
      (SELECT count(*)::int FROM subscribers s WHERE s.confirmed_at < d + '1 ${b}'::interval AND (s.unsubscribed_at IS NULL OR s.unsubscribed_at >= d + '1 ${b}'::interval) AND s.status IN ('confirmed','unsubscribed','bounced','suspended')) AS total
    FROM days ORDER BY d`, [f, t]);
  const activity = await query(`WITH days AS (SELECT generate_series(date_trunc('${b}', $1::timestamptz), date_trunc('${b}', $2::timestamptz), '1 ${b}'::interval) AS d)
    SELECT to_char(d, 'YYYY-MM-DD') AS date,
      (SELECT count(*)::int FROM campaign_recipients r WHERE r.status='accepted' AND r.sent_at >= d AND r.sent_at < d + '1 ${b}'::interval) AS accepted,
      (SELECT count(*)::int FROM campaign_recipients r WHERE r.status='bounced' AND r.updated_at >= d AND r.updated_at < d + '1 ${b}'::interval) AS bounced,
      (SELECT count(*)::int FROM campaign_events e WHERE e.event_type='click' AND e.created_at >= d AND e.created_at < d + '1 ${b}'::interval) AS clicks
    FROM days ORDER BY d`, [f, t]);
  const comparison = await query(`SELECT c.id, c.name, c.finished_at,
      count(r.id) FILTER (WHERE r.status='accepted')::int AS accepted,
      count(r.id) FILTER (WHERE r.status='bounced')::int AS bounced,
      (SELECT count(DISTINCT e.recipient_id)::int FROM campaign_events e WHERE e.campaign_id=c.id AND e.event_type='click') AS clickers,
      (SELECT count(*)::int FROM campaign_events e WHERE e.campaign_id=c.id AND e.event_type='unsubscribe') AS unsubscribes
    FROM campaigns c LEFT JOIN campaign_recipients r ON r.campaign_id=c.id
    WHERE c.status IN ('sent','sending','cancelled') AND c.started_at IS NOT NULL
    GROUP BY c.id ORDER BY c.started_at DESC LIMIT 8`);

  const recent = {
    signups: await query(`SELECT id, email, first_name, status, source, created_at FROM subscribers WHERE anonymized_at IS NULL ORDER BY created_at DESC LIMIT 6`),
    unsubscribes: await query(`SELECT id, email, unsubscribed_at FROM subscribers WHERE unsubscribed_at IS NOT NULL AND anonymized_at IS NULL ORDER BY unsubscribed_at DESC LIMIT 6`),
    campaigns: await query(`SELECT id, name, subject, status, scheduled_at, finished_at, recipient_count, updated_at FROM campaigns ORDER BY updated_at DESC LIMIT 6`),
    sends: await query(`SELECT kind, to_email, subject, status, sandbox, created_at FROM email_logs ORDER BY created_at DESC LIMIT 6`),
    errors: await query(`SELECT kind, to_email, subject, status, error, created_at FROM email_logs WHERE status <> 'accepted' ORDER BY created_at DESC LIMIT 6`),
    jobErrors: await query(`SELECT job_type, last_error, status, created_at FROM scheduled_jobs WHERE last_error IS NOT NULL ORDER BY created_at DESC LIMIT 4`),
  };
  return { period: { from: f, to: t, bucket: b }, totals, content, delivery, clicks, growth, activity, comparison, recent };
}
