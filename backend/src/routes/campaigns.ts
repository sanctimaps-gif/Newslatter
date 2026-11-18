import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.ts';
import { one, query } from '../lib/db.ts';
import { requireAuth } from '../middleware/auth.ts';
import { audit } from '../services/audit.ts';
import { campaignStats, cancelCampaign, countEligible, queueCampaign, renderForRecipient, type Audience, type Campaign } from '../services/campaigns.ts';
import { sendMail } from '../services/mailer.ts';
import { getSettings } from '../services/settings.ts';
import { designSchema } from './content.ts';

const audienceSchema: z.ZodType<Audience> = z.union([
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('segment'), segmentId: z.number().int() }),
  z.object({ type: z.literal('rules'), sources: z.array(z.string()).optional(), tags: z.array(z.string()).optional(), confirmedAfter: z.string().optional(), confirmedBefore: z.string().optional() }),
  z.object({ type: z.literal('selection'), subscriberIds: z.array(z.number().int()).max(50000) }),
]);

const campaignBody = z.object({
  name: z.string().trim().min(1, 'Nom interne obligatoire').max(150),
  subject: z.string().trim().min(1, 'Objet obligatoire').max(200),
  preheader: z.string().max(200).optional().nullable(),
  fromName: z.string().trim().min(1).max(100),
  fromEmail: z.string().trim().email('Adresse d\'expédition invalide'),
  replyTo: z.string().trim().email().optional().or(z.literal('')).nullable(),
  newsletterId: z.number().int().optional().nullable(),
  design: designSchema,
  audience: audienceSchema.default({ type: 'all' }),
  trackOpens: z.boolean().default(false),
});

/** Les campagnes réelles ne partent que si l'infrastructure a été vérifiée (ou en bac à sable, où rien ne sort). */
export async function sendingGate(): Promise<string | null> {
  if (env.MAIL_SANDBOX) return null;
  const s = await getSettings();
  if (!s.realSendingEnabled) return 'Les envois réels ne sont pas encore activés : vérifiez SMTP, SPF, DKIM, DMARC et envoyez un e-mail de test (Paramètres → Envoi).';
  return null;
}

function assertSenderDomain(fromEmail: string) {
  const domain = fromEmail.split('@')[1]?.toLowerCase();
  if (domain !== 'sanctimaps.fr') throw Object.assign(new Error('L\'adresse d\'expédition doit appartenir au domaine sanctimaps.fr.'), { statusCode: 400 });
}

export default async function campaignRoutes(app: FastifyInstance) {
  app.get('/api/admin/campaigns', { preHandler: requireAuth('viewer') }, async (req) => {
    const q = z.object({ status: z.string().max(20).optional(), from: z.string().optional(), to: z.string().optional() }).parse(req.query);
    const where = ['true']; const params: unknown[] = [];
    if (q.status) { params.push(q.status.split(',')); where.push(`c.status = ANY($${params.length}::text[])`); }
    if (q.from) { params.push(q.from); where.push(`c.created_at >= $${params.length}`); }
    if (q.to) { params.push(`${q.to}T23:59:59`); where.push(`c.created_at <= $${params.length}`); }
    return query(`SELECT c.id, c.name, c.subject, c.status, c.scheduled_at, c.timezone, c.started_at, c.finished_at, c.recipient_count, c.created_at, c.updated_at,
      (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id=c.id AND r.status='accepted') AS accepted,
      (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id=c.id AND r.status='bounced') AS bounced,
      (SELECT count(DISTINCT e.recipient_id)::int FROM campaign_events e WHERE e.campaign_id=c.id AND e.event_type='click') AS clickers
      FROM campaigns c WHERE ${where.join(' AND ')} ORDER BY COALESCE(c.scheduled_at, c.created_at) DESC`, params);
  });

  app.get('/api/admin/campaigns/:id', { preHandler: requireAuth('viewer') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const c = await one<Campaign>('SELECT * FROM campaigns WHERE id=$1', [id]);
    if (!c) return reply.code(404).send({ error: 'Campagne introuvable.' });
    return { campaign: c, stats: await campaignStats(id) };
  });

  app.get('/api/admin/campaigns/:id/recipients', { preHandler: requireAuth('viewer') }, async (req) => {
    const id = Number((req.params as any).id);
    const q = z.object({ status: z.string().max(20).optional(), page: z.coerce.number().min(1).default(1) }).parse(req.query);
    const params: unknown[] = [id]; let w = 'campaign_id=$1';
    if (q.status) { params.push(q.status); w += ` AND status=$2`; }
    const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM campaign_recipients WHERE ${w}`, params);
    params.push((q.page - 1) * 50);
    const rows = await query(`SELECT id, email, status, attempts, sent_at, last_error FROM campaign_recipients WHERE ${w} ORDER BY id LIMIT 50 OFFSET $${params.length}`, params);
    return { rows, total: total!.n };
  });

  app.post('/api/admin/audience/count', { preHandler: requireAuth('viewer', { self: true }) }, async (req) => {
    const { audience } = z.object({ audience: audienceSchema }).parse(req.body);
    return { count: await countEligible(audience) };
  });

  app.post('/api/admin/campaigns', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const b = campaignBody.parse(req.body);
    assertSenderDomain(b.fromEmail);
    const c = await one<any>(`INSERT INTO campaigns(name, subject, preheader, from_name, from_email, reply_to, newsletter_id, design, audience, track_opens, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [b.name, b.subject, b.preheader ?? null, b.fromName, b.fromEmail, b.replyTo || null, b.newsletterId ?? null, JSON.stringify(b.design), JSON.stringify(b.audience), b.trackOpens, req.user!.id]);
    await audit(req.user!.id, 'campaign.create', 'campaign', c.id, null, req.ip);
    return reply.code(201).send(c);
  });

  app.put('/api/admin/campaigns/:id', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = campaignBody.parse(req.body);
    assertSenderDomain(b.fromEmail);
    const cur = await one<Campaign>('SELECT status FROM campaigns WHERE id=$1', [id]);
    if (!cur) return reply.code(404).send({ error: 'Campagne introuvable.' });
    if (!['draft', 'scheduled', 'cancelled'].includes(cur.status)) return reply.code(409).send({ error: 'Une campagne en cours ou envoyée ne peut plus être modifiée.' });
    // Modifier une campagne programmée la repasse en brouillon : il faudra la reconfirmer.
    const c = await one(`UPDATE campaigns SET name=$2, subject=$3, preheader=$4, from_name=$5, from_email=$6, reply_to=$7, newsletter_id=$8, design=$9, audience=$10, track_opens=$11,
      status='draft', updated_at=now() WHERE id=$1 RETURNING *`,
    [id, b.name, b.subject, b.preheader ?? null, b.fromName, b.fromEmail, b.replyTo || null, b.newsletterId ?? null, JSON.stringify(b.design), JSON.stringify(b.audience), b.trackOpens]);
    return c;
  });

  app.delete('/api/admin/campaigns/:id', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const r = await one(`DELETE FROM campaigns WHERE id=$1 AND status IN ('draft','cancelled') AND started_at IS NULL RETURNING id`, [id]);
    if (!r) return reply.code(409).send({ error: 'Seuls les brouillons jamais envoyés peuvent être supprimés.' });
    await audit(req.user!.id, 'campaign.delete', 'campaign', id, null, req.ip);
    return { ok: true };
  });

  app.post('/api/admin/campaigns/:id/duplicate', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const c = await one<any>('SELECT * FROM campaigns WHERE id=$1', [Number((req.params as any).id)]);
    if (!c) return reply.code(404).send({ error: 'Campagne introuvable.' });
    return reply.code(201).send(await one(`INSERT INTO campaigns(name, subject, preheader, from_name, from_email, reply_to, newsletter_id, design, audience, track_opens, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [`${c.name} (copie)`, c.subject, c.preheader, c.from_name, c.from_email, c.reply_to, c.newsletter_id, JSON.stringify(c.design), JSON.stringify(c.audience), c.track_opens, req.user!.id]));
  });

  // E-mail de test : jamais aux abonnés, uniquement à une adresse contrôlée.
  app.post('/api/admin/campaigns/:id/test', { preHandler: requireAuth('editor'), config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { to } = z.object({ to: z.string().trim().email() }).parse(req.body);
    const c = await one<Campaign>('SELECT * FROM campaigns WHERE id=$1', [id]);
    if (!c) return reply.code(404).send({ error: 'Campagne introuvable.' });
    if (!env.MAIL_SANDBOX) {
      const s = await getSettings();
      const admins = (await query<{ email: string }>('SELECT email FROM users')).map((u) => u.email.toLowerCase());
      const allowed = [...admins, ...(s.organization.contactEmail ? [s.organization.contactEmail.toLowerCase()] : []), s.sender.replyTo.toLowerCase()].filter(Boolean);
      if (!allowed.includes(to.toLowerCase())) return reply.code(400).send({ error: 'En mode réel, les tests ne peuvent être envoyés qu\'à une adresse d\'administrateur ou de contact de la plateforme.' });
    }
    const r = await renderForRecipient({ campaign: c, subscriberId: 0, firstName: 'Testeur' });
    const outcome = await sendMail({ to, subject: `[TEST] ${c.subject}`, html: r.html, text: r.text, fromName: c.from_name, fromEmail: c.from_email, replyTo: c.reply_to ?? undefined, kind: 'test', campaignId: c.id, headers: { 'X-SanctiMaps-Test': 'true' } });
    if (outcome.status === 'accepted') {
      await query(`INSERT INTO settings(key, value) VALUES ('testEmail', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify({ sentAt: new Date().toISOString(), to, sandbox: env.MAIL_SANDBOX })]);
    }
    await audit(req.user!.id, 'campaign.test', 'campaign', id, { to, status: outcome.status }, req.ip);
    return { ...outcome, sandbox: env.MAIL_SANDBOX };
  });

  app.post('/api/admin/campaigns/:id/send', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = z.object({
      mode: z.enum(['now', 'schedule']),
      scheduledAt: z.string().datetime({ offset: true }).optional(),
      timezone: z.string().max(60).default('Europe/Paris'),
      confirm: z.literal(true, { message: 'Confirmation explicite requise.' }),
    }).parse(req.body);
    const gate = await sendingGate();
    if (gate) return reply.code(412).send({ error: gate });
    const c = await one<Campaign>('SELECT * FROM campaigns WHERE id=$1', [id]);
    if (!c) return reply.code(404).send({ error: 'Campagne introuvable.' });
    const n = await countEligible(c.audience);
    if (n === 0) return reply.code(400).send({ error: 'Aucun destinataire éligible (abonnés confirmés uniquement).' });
    const when = b.mode === 'schedule' ? new Date(b.scheduledAt ?? '') : null;
    if (b.mode === 'schedule' && (!when || isNaN(+when))) return reply.code(400).send({ error: 'Date de programmation invalide.' });
    const updated = await queueCampaign(id, req.user!.id, when, b.timezone);
    await audit(req.user!.id, b.mode === 'now' ? 'campaign.send_now' : 'campaign.schedule', 'campaign', id, { recipients: n, scheduledAt: when, timezone: b.timezone }, req.ip);
    return { campaign: updated, recipients: n };
  });

  app.post('/api/admin/campaigns/:id/cancel', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const c = await cancelCampaign(id);
    if (!c) return reply.code(404).send({ error: 'Campagne introuvable.' });
    await audit(req.user!.id, 'campaign.cancel', 'campaign', id, null, req.ip);
    return c;
  });

  app.post('/api/admin/campaigns/:id/unschedule', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const c = await one(`UPDATE campaigns SET status='draft', updated_at=now() WHERE id=$1 AND status='scheduled' RETURNING *`, [id]);
    if (!c) return reply.code(409).send({ error: 'Cette campagne n\'est pas programmée.' });
    await audit(req.user!.id, 'campaign.unschedule', 'campaign', id, null, req.ip);
    return c;
  });
}
