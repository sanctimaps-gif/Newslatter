// Tâches périodiques : programmation, reprise après incident, automatisations quotidiennes, rétention.
import { env } from '../../../backend/src/config/env.ts';
import { one, query } from '../../../backend/src/lib/db.ts';
import { promoteDueCampaigns } from '../../../backend/src/services/campaigns.ts';
import { enqueue, recoverStaleJobs } from '../../../backend/src/services/queue.ts';
import { getSettings } from '../../../backend/src/services/settings.ts';
import { markUncertainRecipients } from '../processors/campaign.ts';
import { sendAdminReminder } from '../processors/emails.ts';

export async function tick(workerId: string) {
  const promoted = await promoteDueCampaigns();
  await recoverStaleJobs(10);
  await markUncertainRecipients();
  const day = new Date().toISOString().slice(0, 10);
  await enqueue('maintenance.daily', {}, { dedupeKey: `daily-${day}` });
  await query(`INSERT INTO settings(key, value) VALUES ('workerHeartbeat', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [JSON.stringify({ at: new Date().toISOString(), workerId, sandbox: env.MAIL_SANDBOX })]);
  return { promoted };
}

async function logRun(key: string, status: string, detail: object) {
  await query('INSERT INTO automation_runs(automation_key, status, detail) VALUES ($1,$2,$3)', [key, status, JSON.stringify(detail)]);
}

export async function daily() {
  const autos = new Map((await query<any>('SELECT * FROM automations')).map((a) => [a.key, a]));
  const settings = await getSettings();
  const adminEmail = (await one<{ email: string }>(`SELECT email FROM users WHERE role='admin' ORDER BY id LIMIT 1`))?.email;

  const purge = autos.get('purge_unconfirmed');
  if (purge?.enabled) {
    const days = Number(purge.config.days ?? settings.retention.unconfirmedDays);
    const rows = await query(`DELETE FROM subscribers WHERE status='pending' AND confirmed_at IS NULL AND created_at < now() - ($1 || ' days')::interval RETURNING id`, [String(days)]);
    await logRun('purge_unconfirmed', 'ok', { deleted: rows.length, days });
  }

  const inactive = autos.get('inactive_subscribers');
  if (inactive?.enabled) {
    const months = Number(inactive.config.months ?? 12);
    const r = await one<{ n: number }>(`SELECT count(*)::int AS n FROM subscribers s WHERE s.status='confirmed' AND s.confirmed_at < now() - ($1 || ' months')::interval
      AND (s.last_activity_at IS NULL OR s.last_activity_at < now() - ($1 || ' months')::interval)`, [String(months)]);
    await logRun('inactive_subscribers', 'ok', { inactive: r?.n ?? 0, months, note: 'Signalement uniquement : aucune suppression automatique.' });
  }

  const reminder = autos.get('editorial_reminder');
  if (reminder?.enabled) {
    const days = Number(reminder.config.days ?? 7);
    const next = await one(`SELECT 1 FROM campaigns WHERE status IN ('scheduled','queued','sending') OR (status='sent' AND finished_at > now() - ($1 || ' days')::interval)`, [String(days)]);
    const to = String(reminder.config.to || '') || adminEmail;
    if (!next && to) {
      await sendAdminReminder(to, 'Rappel : aucune lettre programmée', `Aucune lettre n'a été envoyée ni programmée depuis ${days} jours.\n\n[Préparer la prochaine lettre](${env.PUBLIC_URL}/admin/creer)`, 'admin_notification');
      await logRun('editorial_reminder', 'ok', { sentTo: to });
    } else await logRun('editorial_reminder', 'skipped', { reason: next ? 'Une lettre est programmée ou récente.' : 'Aucun destinataire.' });
  }

  // Rétention des journaux techniques
  await query(`DELETE FROM email_logs WHERE created_at < now() - ($1 || ' months')::interval`, [String(settings.retention.logsMonths)]);
  await query(`DELETE FROM sessions WHERE expires_at < now()`);
  await query(`DELETE FROM scheduled_jobs WHERE status IN ('done','cancelled') AND created_at < now() - interval '30 days'`);
  await query(`DELETE FROM confirmation_tokens WHERE expires_at < now() - interval '7 days'`);
}
