import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { env, isProd, ROOT_DIR } from './config/env.ts';
import adminRoutes from './routes/admin.ts';
import authRoutes from './routes/auth.ts';
import campaignRoutes from './routes/campaigns.ts';
import contentRoutes from './routes/content.ts';
import publicRoutes from './routes/public.ts';
import subscriberRoutes from './routes/subscribers.ts';

export async function buildApp(opts: { logger?: boolean; serveFrontend?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: true, // derrière Caddy / Nginx
    bodyLimit: 1_000_000,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        frameSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // images lues par les clients de messagerie
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: false } : false,
  });
  await app.register(cookie);
  // Désinscription en un clic (RFC 8058) : Gmail/Yahoo envoient « List-Unsubscribe=One-Click » en x-www-form-urlencoded
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 4096 }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 } });

  // CORS : uniquement l'inscription publique, uniquement depuis les origines autorisées.
  const origins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    methods: ['POST', 'GET'],
    credentials: false,
    hook: 'preHandler',
  });
  app.addHook('onRequest', async (req, reply) => {
    // Les en-têtes CORS ne sont exposés que sur /api/public/* ; l'API d'admin n'accepte que la même origine.
    if (req.headers.origin && !req.url.startsWith('/api/public/') && req.method !== 'GET' && req.method !== 'HEAD') {
      const allowed = [env.PUBLIC_URL, `http://localhost:${env.API_PORT}`];
      if (!allowed.some((o) => req.headers.origin === o) && !(env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(req.headers.origin)))) {
        return reply.code(403).send({ error: 'Origine non autorisée.' });
      }
    }
  });

  app.setErrorHandler((err: FastifyError | ZodError | Error, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: err.issues[0]?.message ?? 'Données invalides.', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    const status = (err as any).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'Erreur interne du serveur.' : err.message });
  });

  // Médias publics (HTTPS en production) — nécessaires pour l'affichage des images dans les e-mails
  if (!existsSync(env.MEDIA_DIR)) mkdirSync(env.MEDIA_DIR, { recursive: true });
  await app.register(fastifyStatic, {
    root: env.MEDIA_DIR, prefix: '/media/', decorateReply: false, index: false, dotfiles: 'deny',
    setHeaders: (res: any) => { const set = (k: string, v: string) => (typeof res.setHeader === 'function' ? res.setHeader(k, v) : res.header(k, v)); set('X-Content-Type-Options', 'nosniff'); set('Cache-Control', 'public, max-age=31536000, immutable'); set('Content-Security-Policy', "default-src 'none'"); },
  });

  await app.register(publicRoutes);
  await app.register(authRoutes);
  await app.register(subscriberRoutes);
  await app.register(contentRoutes);
  await app.register(campaignRoutes);
  await app.register(adminRoutes);

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));

  // En production (un seul conteneur possible), l'API peut aussi servir le frontend compilé.
  const dist = resolve(ROOT_DIR, 'frontend/dist');
  if (opts.serveFrontend && existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, prefix: '/', wildcard: false, decorateReply: true });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/media/')) return reply.code(404).send({ error: 'Introuvable.' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
