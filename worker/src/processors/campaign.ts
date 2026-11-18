// Envoi d'une campagne par lots. Garanties :
//  - une ligne destinataire unique par (campagne, abonné) ;
//  - chaque ligne est verrouillée (SKIP LOCKED) puis passée à « sending » AVANT l'envoi ;
//  - une ligne restée « sending » après un arrêt brutal devient « uncertain » et n'est JAMAIS renvoyée ;
//  - un abonné désinscrit entre-temps est exclu au dernier moment.
import { env } from '../../../backend/src/config/env.ts';
import { one, query, tx } from '../../../backend/src/lib/db.ts';
import { campaignLinks, listUnsubscribeHeaders, renderForRecipient, type Campaign } from '../../../backend/src/services/campaigns.ts';
import { sendMail } from '../../../backend/src/services/mailer.ts';
import { enqueue } from '../../../backend/src/services/queue.ts';
import { getSettings } from '../../../backend/src/services/settings.ts';
import { applyDeliveryEvent } from '../../../backend/src/routes/public.ts';

export async function sendCampaignBatch(campaignId: number): Promise<{ sent: number; remaining: number; done: boolean }> {
  const settings = await getSettings();
  const camp = await one<Campaign>('SELECT * FROM campaigns WHERE id=$1', [campaignId]);
  if (!camp || camp.status !== 'sending') return { sent: 0, remaining: 0, done: true };

  // Respect du débit maximal horaire configuré (limites du relais SMTP)
  const lastHour = await one<{ n: number }>(`SELECT count(*)::int AS n FROM email_logs WHERE kind='campaign' AND created_at > now() - interval '1 hour'`);
  const budget = Math.max(0, settings.sending.maxPerHour - (lastHour?.n ?? 0));
  if (budget === 0) {
    await enqueue('campaign.send_batch', { campaignId }, { runAt: new Date(Date.now() + 5 * 60_000), dedupeKey: `batch-${campaignId}-wait-${Math.floor(Date.now() / 300_000)}` });
    return { sent: 0, remaining: -1, done: false };
  }
  const size = Math.min(settings.sending.batchSize, budget);

  const batch = await tx(async (c) => query<{ id: number; subscriber_id: number; email: string; attempts: number }>(
    `UPDATE campaign_recipients SET status='sending', attempts=attempts+1, updated_at=now()
     WHERE id IN (SELECT id FROM campaign_recipients WHERE campaign_id=$1 AND status='pending' AND next_attempt_at <= now()
                  ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $2)
     RETURNING id, subscriber_id, email, attempts`, [campaignId, size], c));

  const links = await campaignLinks(campaignId);
  let sent = 0;
  for (const r of batch) {
    const sub = await one<{ status: string; first_name: string | null; email: string }>('SELECT status, first_name, email FROM subscribers WHERE id=$1', [r.subscriber_id]);
    if (!sub || sub.status !== 'confirmed') {
      await query(`UPDATE campaign_recipients SET status=$2, last_error='Exclu : abonné non confirmé au moment de l''envoi', updated_at=now() WHERE id=$1`, [r.id, sub?.status === 'unsubscribed' ? 'unsubscribed' : 'skipped']);
      continue;
    }
    const rendered = await renderForRecipient({ campaign: camp, subscriberId: r.subscriber_id, firstName: sub.first_name, recipientId: r.id, links });
    const outcome = await sendMail({
      to: sub.email, subject: camp.subject, html: rendered.html, text: rendered.text,
      fromName: camp.from_name, fromEmail: camp.from_email, replyTo: camp.reply_to ?? undefined,
      headers: { ...listUnsubscribeHeaders(r.subscriber_id, camp.reply_to ?? undefined), 'X-Campaign-Id': String(camp.id), Precedence: 'bulk' },
      kind: 'campaign', campaignId: camp.id,
    });
    if (outcome.status === 'accepted') {
      await query(`UPDATE campaign_recipients SET status='accepted', message_id=$2, sent_at=now(), last_error=NULL, updated_at=now() WHERE id=$1`, [r.id, outcome.messageId]);
      await query(`INSERT INTO campaign_events(campaign_id, recipient_id, subscriber_id, event_type) VALUES ($1,$2,$3,'accepted')`, [camp.id, r.id, r.subscriber_id]);
      sent++;
    } else if (outcome.status === 'hard_bounce') {
      await applyDeliveryEvent('hard_bounce', outcome.code === 550 ? 'adresse_inexistante' : 'refus_permanent', outcome.error, { id: r.subscriber_id, email: sub.email }, { id: r.id, campaign_id: camp.id });
    } else if (r.attempts < settings.sending.maxAttempts) {
      // Refus temporaire : nouvelle tentative différée (5 min, 20 min, …)
      await query(`UPDATE campaign_recipients SET status='pending', last_error=$2, next_attempt_at=now() + ($3 || ' minutes')::interval, updated_at=now() WHERE id=$1`,
        [r.id, outcome.error, String(5 * 4 ** (r.attempts - 1))]);
    } else {
      await query(`UPDATE campaign_recipients SET status='failed', last_error=$2, updated_at=now() WHERE id=$1`, [r.id, outcome.error]);
      await query(`INSERT INTO campaign_events(campaign_id, recipient_id, subscriber_id, event_type, detail) VALUES ($1,$2,$3,'failed',$4)`, [camp.id, r.id, r.subscriber_id, JSON.stringify({ error: outcome.error })]);
    }
  }

  const left = await one<{ pending: number; due: number; sending: number; next: Date | null }>(`SELECT
      count(*) FILTER (WHERE status='pending')::int AS pending,
      count(*) FILTER (WHERE status='pending' AND next_attempt_at <= now())::int AS due,
      count(*) FILTER (WHERE status='sending')::int AS sending,
      min(next_attempt_at) FILTER (WHERE status='pending') AS next
    FROM campaign_recipients WHERE campaign_id=$1`, [campaignId]);
  if (left!.pending === 0 && left!.sending === 0) {
    await query(`UPDATE campaigns SET status='sent', finished_at=now(), updated_at=now() WHERE id=$1 AND status='sending'`, [campaignId]);
    return { sent, remaining: 0, done: true };
  }
  const runAt = left!.due > 0 ? new Date(Date.now() + settings.sending.batchDelayMs) : new Date(left!.next ?? Date.now() + 60_000);
  await enqueue('campaign.send_batch', { campaignId }, { runAt, dedupeKey: `batch-${campaignId}-${Date.now()}` });
  return { sent, remaining: left!.pending, done: false };
}

/** Après un arrêt brutal : les messages « sending » depuis plus de 15 min ont un statut inconnu. On ne les renvoie pas. */
export async function markUncertainRecipients() {
  const rows = await query<{ campaign_id: number }>(`UPDATE campaign_recipients SET status='uncertain',
      last_error='Interruption pendant l''envoi : statut inconnu, non renvoyé pour éviter un doublon', updated_at=now()
    WHERE status='sending' AND updated_at < now() - interval '15 minutes' RETURNING campaign_id`);
  for (const id of new Set(rows.map((r) => r.campaign_id))) {
    await enqueue('campaign.send_batch', { campaignId: id }, { dedupeKey: `batch-${id}-recover-${Date.now()}` });
  }
  return rows.length;
}

export const sandboxNotice = () => env.MAIL_SANDBOX;
