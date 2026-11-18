import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.ts';
import { readUnsubscribeToken, safeEqual } from '../lib/crypto.ts';
import { one, query } from '../lib/db.ts';
import { readRecipientToken } from '../services/campaigns.ts';
import { getSetting } from '../services/settings.ts';
import { addSuppression, confirmSubscription, CONFIRMATION_TTL_HOURS, CONSENT_TEXT, lastCampaignFor, requestSubscription, unsubscribe } from '../services/subscribers.ts';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function maskEmail(e: string) {
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

export default async function publicRoutes(app: FastifyInstance) {
  app.get('/api/public/config', async () => ({
    consentText: CONSENT_TEXT,
    confirmationHours: CONFIRMATION_TTL_HOURS,
    purpose: 'Recevoir la lettre d\'information de SanctiMaps : le saint du jour, les nouveaux lieux et saints ajoutés à la carte et les nouveautés du site. Environ une lettre par semaine.',
  }));

  /**
   * Inscription — utilisable par la page /inscription ET par le site principal (formulaire intégré).
   * Protections : clé publique limitée à cette route, origines CORS restreintes, champ piège,
   * délai minimal de remplissage, limitation par IP, réponse identique quel que soit l'état de l'adresse.
   */
  app.post('/api/public/subscribe', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const schema = z.object({
      email: z.string().max(254),
      firstName: z.string().max(80).optional().nullable(),
      consent: z.literal(true, { message: 'Le consentement explicite est obligatoire.' }),
      website: z.string().max(200).optional(), // champ piège invisible
      startedAt: z.number().optional(),          // horodatage d'affichage du formulaire
      siteKey: z.string().max(100).optional(),
      source: z.enum(['formulaire', 'site-principal']).optional(),
    });
    const body = schema.parse(req.body);
    const origin = String(req.headers.origin ?? '');
    const external = origin && !origin.startsWith(env.PUBLIC_URL);
    if (external && (!body.siteKey || !safeEqual(body.siteKey, env.PUBLIC_SITE_KEY))) {
      return reply.code(403).send({ ok: false, error: 'Clé de formulaire invalide.' });
    }
    const ok = { ok: true, message: 'Merci ! Si cette adresse est valide, vous allez recevoir un e-mail pour confirmer votre inscription. Pensez à vérifier vos courriers indésirables.' };
    if (body.website) return ok; // robot : on ne dit rien
    if (body.startedAt && Date.now() - body.startedAt < 2500) return ok;
    try {
      await requestSubscription({ email: body.email, firstName: body.firstName, source: external || body.source === 'site-principal' ? 'site-principal' : 'formulaire', ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '') });
    } catch (e) {
      if (e instanceof z.ZodError) return reply.code(400).send({ ok: false, error: 'Adresse e-mail invalide.' });
      throw e;
    }
    return ok;
  });

  app.post('/api/public/confirm', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(req.body);
    const r = await confirmSubscription(token, { ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '') });
    if (!r.ok) {
      const msg = { invalid: 'Ce lien de confirmation n\'est pas valide.', expired: `Ce lien a expiré (validité ${CONFIRMATION_TTL_HOURS} h). Inscrivez-vous de nouveau pour en recevoir un autre.`, used: 'Ce lien a déjà été utilisé : votre inscription est probablement déjà confirmée.' }[r.reason];
      return reply.code(400).send({ ok: false, reason: r.reason, error: msg });
    }
    return { ok: true, firstName: r.firstName };
  });

  app.get('/api/public/unsubscribe', async (req, reply) => {
    const { t } = z.object({ t: z.string().max(200) }).parse(req.query);
    const id = readUnsubscribeToken(t);
    const s = id ? await one<any>('SELECT email, status, anonymized_at FROM subscribers WHERE id=$1', [id]) : null;
    if (!s) return reply.code(400).send({ ok: false, error: 'Lien de désinscription invalide.' });
    return { ok: true, email: s.anonymized_at ? null : maskEmail(s.email), status: s.status };
  });

  app.post('/api/public/unsubscribe', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const { t } = z.object({ t: z.string().max(200) }).parse(req.body);
    const id = readUnsubscribeToken(t);
    if (!id) return reply.code(400).send({ ok: false, error: 'Lien de désinscription invalide.' });
    const s = await unsubscribe(id, 'page', await lastCampaignFor(id));
    if (!s) return reply.code(400).send({ ok: false, error: 'Lien de désinscription invalide.' });
    return { ok: true };
  });

  // RFC 8058 — désinscription en un clic depuis Gmail / Apple Mail / Outlook
  app.post('/api/public/unsubscribe/one-click', async (req, reply) => {
    const t = String((req.query as any)?.t ?? '');
    const id = readUnsubscribeToken(t);
    if (!id) return reply.code(400).send({ ok: false });
    await unsubscribe(id, 'one-click', await lastCampaignFor(id));
    return { ok: true };
  });

  app.get('/api/public/privacy', async () => {
    const p = await getSetting('privacyPolicy');
    const org = await getSetting('organization');
    return { markdown: p.markdown, reviewed: p.reviewed, contactEmail: org.contactEmail, organization: org.name };
  });

  // ─── Suivi des clics (redirection) ───
  app.get('/r/:t/:l', async (req, reply) => {
    const { t, l } = req.params as { t: string; l: string };
    const rid = readRecipientToken(t);
    const link = /^\d+$/.test(l) ? await one<{ id: number; url: string; campaign_id: number }>('SELECT * FROM campaign_links WHERE id=$1', [Number(l)]) : null;
    if (!link) return reply.code(404).send('Lien introuvable');
    if (rid) {
      const r = await one<any>('SELECT id, subscriber_id, campaign_id FROM campaign_recipients WHERE id=$1', [rid]);
      if (r && r.campaign_id === link.campaign_id) {
        await query(`INSERT INTO campaign_events(campaign_id, recipient_id, subscriber_id, event_type, link_id) VALUES ($1,$2,$3,'click',$4)`, [r.campaign_id, r.id, r.subscriber_id, link.id]);
        if (r.subscriber_id) await query('UPDATE subscribers SET last_activity_at=now() WHERE id=$1', [r.subscriber_id]);
      }
    }
    return reply.redirect(link.url, 302);
  });

  // Pixel d'ouverture (désactivé par défaut ; mesure estimative)
  app.get('/r/o/:t', async (req, reply) => {
    const t = String((req.params as any).t).replace(/\.gif$/, '');
    const rid = readRecipientToken(t);
    if (rid) {
      const r = await one<any>('SELECT id, subscriber_id, campaign_id FROM campaign_recipients WHERE id=$1', [rid]);
      if (r) await query(`INSERT INTO campaign_events(campaign_id, recipient_id, subscriber_id, event_type) VALUES ($1,$2,$3,'open')`, [r.campaign_id, r.id, r.subscriber_id]);
    }
    return reply.header('Content-Type', 'image/gif').header('Cache-Control', 'no-store').send(GIF);
  });

  /**
   * Webhook rebonds / plaintes du relais SMTP (format normalisé, voir documentation/email-configuration.md).
   * Authentifié par un secret partagé (en-tête X-Webhook-Secret).
   */
  app.post('/api/webhooks/bounce', async (req, reply) => {
    if (!env.BOUNCE_WEBHOOK_SECRET || !safeEqual(String(req.headers['x-webhook-secret'] ?? ''), env.BOUNCE_WEBHOOK_SECRET)) {
      return reply.code(401).send({ error: 'Secret invalide.' });
    }
    const events = z.array(z.object({
      type: z.enum(['hard_bounce', 'soft_bounce', 'complaint']),
      category: z.enum(['adresse_inexistante', 'boite_indisponible', 'refus_temporaire', 'refus_permanent', 'plainte']).optional(),
      email: z.string().email(),
      messageId: z.string().optional(),
      diagnostic: z.string().max(1000).optional(),
    })).max(1000).parse(Array.isArray(req.body) ? req.body : [req.body]);
    let processed = 0;
    for (const e of events) {
      const rcpt = e.messageId ? await one<any>('SELECT * FROM campaign_recipients WHERE message_id=$1', [e.messageId]) : null;
      const sub = await one<any>('SELECT * FROM subscribers WHERE email=$1', [e.email]);
      await applyDeliveryEvent(e.type, e.category ?? null, e.diagnostic ?? '', sub, rcpt);
      processed++;
    }
    return { ok: true, processed };
  });
}

/** Politique documentée : 1 rebond permanent ⇒ adresse en erreur ; 3 rebonds temporaires en 30 jours ⇒ adresse en erreur ; plainte ⇒ exclusion immédiate. */
export async function applyDeliveryEvent(type: 'hard_bounce' | 'soft_bounce' | 'complaint', category: string | null, diagnostic: string, sub: any, rcpt: any) {
  const campaignId = rcpt?.campaign_id ?? null;
  const evt = type === 'hard_bounce' ? 'bounce_hard' : type === 'soft_bounce' ? 'bounce_soft' : 'complaint';
  await query(`INSERT INTO campaign_events(campaign_id, recipient_id, subscriber_id, event_type, detail) VALUES ($1,$2,$3,$4,$5)`,
    [campaignId, rcpt?.id ?? null, sub?.id ?? null, evt, JSON.stringify({ category, diagnostic: diagnostic.slice(0, 500) })]);
  if (rcpt && type !== 'complaint') await query(`UPDATE campaign_recipients SET status='bounced', last_error=$2, updated_at=now() WHERE id=$1`, [rcpt.id, diagnostic.slice(0, 500)]);
  if (!sub) return;
  if (type === 'complaint') {
    await unsubscribe(sub.id, 'complaint', campaignId);
    await addSuppression(sub.email, 'complaint');
  } else if (type === 'hard_bounce') {
    await query(`UPDATE subscribers SET status='bounced', bounce_count=bounce_count+1, updated_at=now() WHERE id=$1 AND status IN ('confirmed','pending')`, [sub.id]);
    await addSuppression(sub.email, 'hard_bounce');
  } else {
    const n = await one<{ n: number }>(`SELECT count(*)::int AS n FROM campaign_events WHERE subscriber_id=$1 AND event_type='bounce_soft' AND created_at > now() - interval '30 days'`, [sub.id]);
    await query('UPDATE subscribers SET bounce_count=bounce_count+1, updated_at=now() WHERE id=$1', [sub.id]);
    if ((n?.n ?? 0) >= 3) await query(`UPDATE subscribers SET status='bounced', updated_at=now() WHERE id=$1 AND status='confirmed'`, [sub.id]);
  }
}
