import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.ts';
import { decrypt, encrypt, hashPassword, newTotpSecret, randomToken, sha256, verifyPassword, verifyTotp } from '../lib/crypto.ts';
import { one, query } from '../lib/db.ts';
import { createSession, destroySession, loadSession, requireAuth, SESSION_COOKIE } from '../middleware/auth.ts';
import { audit } from '../services/audit.ts';
import { enqueue } from '../services/queue.ts';

export const passwordSchema = z.string().min(12, 'Le mot de passe doit contenir au moins 12 caractères.').max(200)
  .refine((p) => /[a-z]/i.test(p) && /\d/.test(p), 'Le mot de passe doit contenir des lettres et des chiffres.');

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export default async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/api/auth/login', strict, async (req, reply) => {
    const body = z.object({ email: z.string().trim().max(254), password: z.string().max(200) }).parse(req.body);
    const user = await one<any>('SELECT * FROM users WHERE email=$1', [body.email]);
    const generic = { error: 'Identifiants incorrects.' };
    if (!user) { await verifyPassword(body.password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'); return reply.code(401).send(generic); }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return reply.code(429).send({ error: `Compte temporairement verrouillé après plusieurs échecs. Réessayez dans ${LOCK_MINUTES} minutes.` });
    }
    if (!(await verifyPassword(body.password, user.password_hash))) {
      const fails = user.failed_logins + 1;
      if (fails >= MAX_FAILS) {
        await query(`UPDATE users SET failed_logins=0, locked_until=now() + ($2 || ' minutes')::interval WHERE id=$1`, [user.id, String(LOCK_MINUTES)]);
        await audit(user.id, 'auth.locked', 'user', user.id, null, req.ip);
      } else {
        await query('UPDATE users SET failed_logins=$2 WHERE id=$1', [user.id, fails]);
      }
      await audit(user.id, 'auth.login_failed', 'user', user.id, null, req.ip);
      return reply.code(401).send(generic);
    }
    await query('UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=$1', [user.id]);
    const csrf = await createSession(reply, user.id, req, user.totp_enabled);
    if (user.totp_enabled) return { twoFactorRequired: true, csrfToken: csrf };
    await query('UPDATE users SET last_login_at=now() WHERE id=$1', [user.id]);
    await audit(user.id, 'auth.login', 'user', user.id, null, req.ip);
    return { user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role, totpEnabled: user.totp_enabled }, csrfToken: csrf };
  });

  app.post('/api/auth/2fa', strict, async (req, reply) => {
    const { code } = z.object({ code: z.string().max(10) }).parse(req.body);
    const s = await loadSession(req);
    if (!s || !s.pending2fa) return reply.code(401).send({ error: 'Session expirée, reconnectez-vous.' });
    const u = await one<any>('SELECT * FROM users WHERE id=$1', [s.id]);
    if (!u?.totp_secret || !verifyTotp(decrypt(u.totp_secret), code)) {
      await audit(s.id, 'auth.2fa_failed', 'user', s.id, null, req.ip);
      return reply.code(401).send({ error: 'Code incorrect.' });
    }
    await query('DELETE FROM sessions WHERE id=$1', [s.sessionId]);
    const csrf = await createSession(reply, u.id, req, false);
    await query('UPDATE users SET last_login_at=now() WHERE id=$1', [u.id]);
    await audit(u.id, 'auth.login', 'user', u.id, { twoFactor: true }, req.ip);
    return { user: { id: u.id, email: u.email, displayName: u.display_name, role: u.role, totpEnabled: true }, csrfToken: csrf };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const s = await loadSession(req);
    await destroySession(req, reply);
    if (s) await audit(s.id, 'auth.logout', 'user', s.id, null, req.ip);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req, reply) => {
    const s = await loadSession(req);
    if (!s || s.pending2fa) { if (req.cookies?.[SESSION_COOKIE]) reply.clearCookie(SESSION_COOKIE, { path: '/' }); return reply.code(401).send({ error: 'Non connecté.' }); }
    return { user: { id: s.id, email: s.email, displayName: s.display_name, role: s.role, totpEnabled: s.totp_enabled }, csrfToken: s.csrf };
  });

  // ─── Réinitialisation du mot de passe ───
  app.post('/api/auth/password-reset/request', { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } }, async (req) => {
    const { email } = z.object({ email: z.string().trim().max(254) }).parse(req.body);
    const u = await one<any>('SELECT id, email FROM users WHERE email=$1', [email]);
    if (u) {
      const token = randomToken(32);
      await query(`INSERT INTO password_resets(user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')`, [u.id, sha256(token)]);
      await enqueue('email.password_reset', { userId: u.id, url: `${env.PUBLIC_URL}/admin/reinitialisation?t=${token}` });
      await audit(u.id, 'auth.password_reset_requested', 'user', u.id, null, req.ip);
    }
    return { ok: true, message: 'Si un compte correspond à cette adresse, un lien de réinitialisation valable 1 heure a été envoyé.' };
  });

  app.post('/api/auth/password-reset/confirm', strict, async (req, reply) => {
    const body = z.object({ token: z.string().max(100), password: passwordSchema }).parse(req.body);
    const r = await one<any>(`SELECT * FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()`, [sha256(body.token)]);
    if (!r) return reply.code(400).send({ error: 'Lien invalide ou expiré.' });
    await query('UPDATE password_resets SET used_at=now() WHERE id=$1', [r.id]);
    await query('UPDATE users SET password_hash=$2, failed_logins=0, locked_until=NULL, updated_at=now() WHERE id=$1', [r.user_id, await hashPassword(body.password)]);
    await query('DELETE FROM sessions WHERE user_id=$1', [r.user_id]);
    await audit(r.user_id, 'auth.password_reset', 'user', r.user_id, null, req.ip);
    return { ok: true };
  });

  app.post('/api/auth/password', { preHandler: requireAuth('viewer', { self: true }), config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = z.object({ current: z.string().max(200), next: passwordSchema }).parse(req.body);
    const u = await one<any>('SELECT * FROM users WHERE id=$1', [req.user!.id]);
    if (!(await verifyPassword(body.current, u.password_hash))) return reply.code(400).send({ error: 'Mot de passe actuel incorrect.' });
    await query('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [u.id, await hashPassword(body.next)]);
    await query('DELETE FROM sessions WHERE user_id=$1 AND id <> $2', [u.id, req.user!.sessionId]);
    await audit(u.id, 'auth.password_changed', 'user', u.id, null, req.ip);
    return { ok: true };
  });

  // ─── Authentification à deux facteurs ───
  app.post('/api/auth/2fa/setup', { preHandler: requireAuth('viewer', { self: true }) }, async (req) => {
    const secret = newTotpSecret();
    await query('UPDATE users SET totp_secret=$2 WHERE id=$1 AND totp_enabled=false', [req.user!.id, encrypt(secret)]);
    const label = encodeURIComponent(`SanctiMaps Newsletter:${req.user!.email}`);
    return { secret, otpauth: `otpauth://totp/${label}?secret=${secret}&issuer=SanctiMaps%20Newsletter&digits=6&period=30` };
  });
  app.post('/api/auth/2fa/enable', { preHandler: requireAuth('viewer', { self: true }) }, async (req, reply) => {
    const { code } = z.object({ code: z.string().max(10) }).parse(req.body);
    const u = await one<any>('SELECT * FROM users WHERE id=$1', [req.user!.id]);
    if (!u.totp_secret || !verifyTotp(decrypt(u.totp_secret), code)) return reply.code(400).send({ error: 'Code incorrect : vérifiez l\'heure de votre téléphone.' });
    await query('UPDATE users SET totp_enabled=true WHERE id=$1', [u.id]);
    await audit(u.id, 'auth.2fa_enabled', 'user', u.id, null, req.ip);
    return { ok: true };
  });
  app.post('/api/auth/2fa/disable', { preHandler: requireAuth('viewer', { self: true }) }, async (req, reply) => {
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
    const u = await one<any>('SELECT * FROM users WHERE id=$1', [req.user!.id]);
    if (!(await verifyPassword(password, u.password_hash))) return reply.code(400).send({ error: 'Mot de passe incorrect.' });
    await query('UPDATE users SET totp_enabled=false, totp_secret=NULL WHERE id=$1', [u.id]);
    await audit(u.id, 'auth.2fa_disabled', 'user', u.id, null, req.ip);
    return { ok: true };
  });
}
