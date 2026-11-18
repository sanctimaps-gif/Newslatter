import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.ts';
import { hashPassword } from '../lib/crypto.ts';
import { one, query } from '../lib/db.ts';
import { requireAuth } from '../middleware/auth.ts';
import { audit } from '../services/audit.ts';
import { campaignStats } from '../services/campaigns.ts';
import { checkDomain } from '../services/dns-check.ts';
import { smtpSummary, verifySmtp } from '../services/mailer.ts';
import { getSettings, setSetting } from '../services/settings.ts';
import { dashboard, parsePeriod } from '../services/stats.ts';
import { passwordSchema } from './auth.ts';

const periodQuery = z.object({ period: z.enum(['7d', '30d', '90d', '12m', 'custom']).default('30d'), from: z.string().optional(), to: z.string().optional() });

export default async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/dashboard', { preHandler: requireAuth('viewer') }, async (req) => {
    const q = periodQuery.parse(req.query);
    return dashboard(parsePeriod(q.period, q.from, q.to));
  });

  app.get('/api/admin/stats/campaigns', { preHandler: requireAuth('viewer') }, async (req) => {
    const q = periodQuery.parse(req.query);
    const p = parsePeriod(q.period, q.from, q.to);
    const camps = await query<any>(`SELECT id, name, subject, status, created_at, started_at, finished_at, recipient_count FROM campaigns
      WHERE started_at BETWEEN $1 AND $2 ORDER BY started_at DESC`, [p.from, p.to]);
    const out = [];
    for (const c of camps) out.push({ ...c, stats: await campaignStats(c.id) });
    const totals = out.reduce((a, c) => ({ targeted: a.targeted + c.stats.targeted, accepted: a.accepted + c.stats.accepted, bounced: a.bounced + c.stats.bounced, clickers: a.clickers + c.stats.unique_clickers, clicks: a.clicks + c.stats.clicks, unsubscribes: a.unsubscribes + c.stats.unsubscribes, opens: a.opens + c.stats.unique_opens }),
      { targeted: 0, accepted: 0, bounced: 0, clickers: 0, clicks: 0, unsubscribes: 0, opens: 0 });
    const sources = await query(`SELECT source, count(*)::int AS n FROM subscribers WHERE status='confirmed' GROUP BY source ORDER BY n DESC`);
    return { period: p, campaigns: out, totals, sources, opensTracked: (await getSettings()).tracking.opens };
  });

  // ─── Automatisations ───
  app.get('/api/admin/automations', { preHandler: requireAuth('viewer') }, async () => {
    const autos = await query('SELECT * FROM automations ORDER BY key');
    const runs = await query('SELECT * FROM automation_runs ORDER BY created_at DESC LIMIT 50');
    return { automations: autos, runs };
  });
  app.put('/api/admin/automations/:key', { preHandler: requireAuth('admin') }, async (req, reply) => {
    const key = String((req.params as any).key);
    const body = z.object({ enabled: z.boolean(), config: z.record(z.string(), z.union([z.string().max(5000), z.number(), z.boolean()])) }).parse(req.body);
    if (key === 'welcome_email' && typeof body.config.body === 'string' && body.config.body.length < 10) return reply.code(400).send({ error: 'Le message de bienvenue est trop court.' });
    const a = await one('UPDATE automations SET enabled=$2, config=$3, updated_at=now() WHERE key=$1 RETURNING *', [key, body.enabled, JSON.stringify(body.config)]);
    if (!a) return reply.code(404).send({ error: 'Automatisation inconnue.' });
    await audit(req.user!.id, body.enabled ? 'automation.enable' : 'automation.disable', 'automation', key, body.config, req.ip);
    return a;
  });

  // ─── Paramètres ───
  app.get('/api/admin/settings', { preHandler: requireAuth('viewer') }, async () => ({
    settings: await getSettings(),
    smtp: smtpSummary(),
    sandbox: env.MAIL_SANDBOX,
    publicUrl: env.PUBLIC_URL,
    siteKey: env.PUBLIC_SITE_KEY,
    bounceWebhookConfigured: Boolean(env.BOUNCE_WEBHOOK_SECRET),
  }));

  const sections = {
    sender: z.object({ fromName: z.string().trim().min(1).max(100), fromEmail: z.string().trim().email().refine((e) => e.toLowerCase().endsWith('@sanctimaps.fr'), 'L\'adresse doit appartenir au domaine sanctimaps.fr.'), replyTo: z.string().trim().email().or(z.literal('')) }),
    organization: z.object({ name: z.string().trim().min(1).max(100), legalText: z.string().trim().min(5).max(400), contactEmail: z.string().trim().email().or(z.literal('')), website: z.string().url() }),
    sending: z.object({ batchSize: z.number().int().min(1).max(500), batchDelayMs: z.number().int().min(0).max(600000), maxPerHour: z.number().int().min(1).max(100000), maxAttempts: z.number().int().min(1).max(10) }),
    tracking: z.object({ clicks: z.boolean(), opens: z.boolean() }),
    dkimSelector: z.string().trim().max(63).regex(/^[a-zA-Z0-9._-]*$/),
    privacyPolicy: z.object({ markdown: z.string().max(50000), reviewed: z.boolean() }),
    retention: z.object({ unconfirmedDays: z.number().int().min(1).max(365), logsMonths: z.number().int().min(1).max(120) }),
    timezone: z.string().max(60),
  } as const;

  app.put('/api/admin/settings/:section', { preHandler: requireAuth('admin') }, async (req, reply) => {
    const section = String((req.params as any).section) as keyof typeof sections;
    const schema = sections[section];
    if (!schema) return reply.code(404).send({ error: 'Section inconnue.' });
    const value = schema.parse(req.body);
    await setSetting(section as any, value as any);
    if (section === 'sender') await setSetting('realSendingEnabled', false); // un changement d'expéditeur impose une nouvelle vérification
    await audit(req.user!.id, 'settings.update', 'settings', section, null, req.ip);
    return getSettings();
  });

  app.post('/api/admin/settings/smtp/verify', { preHandler: requireAuth('admin'), config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const r = await verifySmtp();
    await setSetting('smtpCheck', { ok: r.ok, checkedAt: new Date().toISOString(), message: r.message });
    await audit(req.user!.id, 'settings.smtp_verify', 'settings', 'smtp', r, req.ip);
    return r;
  });

  app.post('/api/admin/settings/domain/check', { preHandler: requireAuth('admin'), config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const s = await getSettings();
    const r = await checkDomain(s.sender.fromEmail, s.dkimSelector);
    await setSetting('domainCheck', { checkedAt: r.checkedAt, spf: r.spf, dkim: r.dkim, dmarc: r.dmarc, details: r.details });
    await audit(req.user!.id, 'settings.domain_check', 'settings', r.domain, { spf: r.spf, dkim: r.dkim, dmarc: r.dmarc }, req.ip);
    return r;
  });

  app.post('/api/admin/settings/real-sending', { preHandler: requireAuth('admin') }, async (req, reply) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    if (enabled) {
      if (env.MAIL_SANDBOX) return reply.code(412).send({ error: 'La plateforme est en mode bac à sable (MAIL_SANDBOX=true) : configurez d\'abord un vrai relais SMTP.' });
      const s = await getSettings();
      const missing = [
        !s.smtpCheck.ok && 'connexion SMTP vérifiée',
        !s.domainCheck.spf && 'SPF', !s.domainCheck.dkim && 'DKIM', !s.domainCheck.dmarc && 'DMARC',
        !s.testEmail.sentAt && 'e-mail de test accepté',
        !s.privacyPolicy.reviewed && 'politique de confidentialité relue',
      ].filter(Boolean);
      if (missing.length) return reply.code(412).send({ error: `Vérifications manquantes : ${missing.join(', ')}.` });
    }
    await setSetting('realSendingEnabled', enabled);
    await audit(req.user!.id, enabled ? 'settings.real_sending_on' : 'settings.real_sending_off', 'settings', 'sending', null, req.ip);
    return { ok: true, enabled };
  });

  app.get('/api/admin/settings/dns-guide', { preHandler: requireAuth('viewer') }, async () => {
    const s = await getSettings();
    const domain = s.sender.fromEmail.split('@')[1];
    return {
      domain,
      records: [
        { type: 'A', name: 'newsletter', value: '<IP publique du serveur>', purpose: 'Sous-domaine de la plateforme (ne touche pas sanctimaps.fr ni www).' },
        { type: 'TXT', name: '@', value: 'v=spf1 <mécanismes existants> include:<domaine SPF du relais> ~all', purpose: 'SPF : ajouter le relais au SPF EXISTANT (un seul enregistrement v=spf1 par domaine).' },
        { type: 'TXT / CNAME', name: `${s.dkimSelector || '<sélecteur>'}._domainkey`, value: '<clé publique fournie par le relais>', purpose: 'DKIM : signature des messages.' },
        { type: 'TXT', name: '_dmarc', value: `v=DMARC1; p=none; rua=mailto:${s.organization.contactEmail || 'dmarc@' + domain}; adkim=r; aspf=r`, purpose: 'DMARC : commencer en p=none, puis quarantine après 2 à 4 semaines de rapports propres.' },
      ],
    };
  });

  // ─── Journaux ───
  app.get('/api/admin/logs/email', { preHandler: requireAuth('viewer') }, async (req) => {
    const q = z.object({ status: z.string().max(20).optional(), page: z.coerce.number().min(1).default(1) }).parse(req.query);
    const params: unknown[] = []; let w = 'true';
    if (q.status) { params.push(q.status); w = 'status=$1'; }
    params.push((q.page - 1) * 50);
    return query(`SELECT * FROM email_logs WHERE ${w} ORDER BY created_at DESC LIMIT 50 OFFSET $${params.length}`, params);
  });
  app.get('/api/admin/logs/audit', { preHandler: requireAuth('admin') }, async () =>
    query(`SELECT a.*, u.display_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 200`));
  app.get('/api/admin/jobs', { preHandler: requireAuth('viewer') }, async () => {
    const counts = await query(`SELECT job_type, status, count(*)::int AS n FROM scheduled_jobs GROUP BY job_type, status ORDER BY job_type`);
    const heartbeat = await one<{ value: any }>(`SELECT value FROM settings WHERE key='workerHeartbeat'`);
    return { counts, workerHeartbeat: heartbeat?.value ?? null };
  });

  // ─── Comptes (architecture multi-rôles, un administrateur principal au départ) ───
  app.get('/api/admin/users', { preHandler: requireAuth('admin') }, async () =>
    query('SELECT id, email, display_name, role, totp_enabled, last_login_at, created_at FROM users ORDER BY id'));
  app.post('/api/admin/users', { preHandler: requireAuth('admin') }, async (req, reply) => {
    const b = z.object({ email: z.string().trim().email(), displayName: z.string().trim().min(1).max(80), role: z.enum(['admin', 'editor', 'viewer']), password: passwordSchema }).parse(req.body);
    if (await one('SELECT 1 FROM users WHERE email=$1', [b.email])) return reply.code(409).send({ error: 'Ce compte existe déjà.' });
    const u = await one<any>('INSERT INTO users(email, display_name, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, email, display_name, role', [b.email, b.displayName, b.role, await hashPassword(b.password)]);
    await audit(req.user!.id, 'user.create', 'user', u.id, { role: b.role }, req.ip);
    return reply.code(201).send(u);
  });
  app.delete('/api/admin/users/:id', { preHandler: requireAuth('admin') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (id === req.user!.id) return reply.code(400).send({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    await query('DELETE FROM users WHERE id=$1', [id]);
    await audit(req.user!.id, 'user.delete', 'user', id, null, req.ip);
    return { ok: true };
  });
  app.patch('/api/admin/profile', { preHandler: requireAuth('viewer', { self: true }) }, async (req) => {
    const b = z.object({ displayName: z.string().trim().min(1).max(80) }).parse(req.body);
    await query('UPDATE users SET display_name=$2, updated_at=now() WHERE id=$1', [req.user!.id, b.displayName]);
    return { ok: true };
  });
}
