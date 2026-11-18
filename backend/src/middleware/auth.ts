import type { FastifyReply, FastifyRequest } from 'fastify';
import { isProd } from '../config/env.ts';
import { randomToken, safeEqual, sha256 } from '../lib/crypto.ts';
import { one, query } from '../lib/db.ts';

export type Role = 'admin' | 'editor' | 'viewer';
export interface SessionUser { id: number; email: string; display_name: string; role: Role; totp_enabled: boolean; sessionId: string; csrf: string; pending2fa: boolean }

declare module 'fastify' {
  interface FastifyRequest { user?: SessionUser }
}

export const SESSION_COOKIE = 'snl_session';
const SESSION_HOURS = 12;

export async function createSession(reply: FastifyReply, userId: number, req: FastifyRequest, pending2fa: boolean) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  await query(`INSERT INTO sessions(id, user_id, csrf_token, pending_2fa, ip, user_agent, expires_at)
    VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' hours')::interval)`,
  [sha256(token), userId, csrf, pending2fa, req.ip, String(req.headers['user-agent'] ?? '').slice(0, 300), String(pending2fa ? 0.17 : SESSION_HOURS)]);
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/', maxAge: SESSION_HOURS * 3600 });
  return csrf;
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await query('DELETE FROM sessions WHERE id=$1', [sha256(token)]);
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function loadSession(req: FastifyRequest): Promise<SessionUser | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token || token.length > 100) return null;
  const row = await one<any>(`SELECT s.id AS sid, s.csrf_token, s.pending_2fa, u.id, u.email, u.display_name, u.role, u.totp_enabled
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id=$1 AND s.expires_at > now()`, [sha256(token)]);
  if (!row) return null;
  await query(`UPDATE sessions SET last_seen_at=now() WHERE id=$1 AND last_seen_at < now() - interval '1 minute'`, [row.sid]);
  return { id: row.id, email: row.email, display_name: row.display_name, role: row.role, totp_enabled: row.totp_enabled, sessionId: row.sid, csrf: row.csrf_token, pending2fa: row.pending_2fa };
}

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

/** Protège une route : session valide, 2FA complétée, rôle suffisant, jeton CSRF pour les écritures. */
export function requireAuth(minRole: Role = 'viewer', opts: { self?: boolean } = {}) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await loadSession(req);
    if (!user || user.pending2fa) return reply.code(401).send({ error: 'Authentification requise.' });
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (mutating) {
      const header = String(req.headers['x-csrf-token'] ?? '');
      if (!header || !safeEqual(header, user.csrf)) return reply.code(403).send({ error: 'Jeton CSRF invalide.' });
    }
    // Les lecteurs ne peuvent jamais écrire ; les éditeurs ne touchent pas aux réglages sensibles.
    const needed: Role = mutating && minRole === 'viewer' && !opts.self ? 'editor' : minRole;
    if (ROLE_RANK[user.role] < ROLE_RANK[needed]) return reply.code(403).send({ error: 'Droits insuffisants.' });
    req.user = user;
  };
}
