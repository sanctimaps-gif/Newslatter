import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from '../config/env.ts';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const hmac = (s: string) => createHmac('sha256', env.APP_SECRET).update(s).digest('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Empreinte stable d'une adresse (liste d'exclusion, survit à l'anonymisation). */
export const emailHash = (email: string) => createHmac('sha256', env.APP_SECRET).update(email.trim().toLowerCase()).digest('hex');

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(pw, Buffer.from(salt, 'base64'), 64, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  const expected = Buffer.from(hash, 'base64');
  return expected.length === key.length && timingSafeEqual(expected, key);
}

const encKey = createHash('sha256').update(`enc:${env.APP_SECRET}`).digest();
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey, iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((x) => x.toString('base64')).join('.');
}
export function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = createDecipheriv('aes-256-gcm', encKey, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

// ─── TOTP (RFC 6238) ───
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string): Buffer {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(ch); if (i < 0) continue; value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export function totpCode(secret: string, time = Date.now(), step = 30): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / step)));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, '0');
}
export function verifyTotp(secret: string, code: string): boolean {
  const c = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  return [-1, 0, 1].some((w) => safeEqual(totpCode(secret, Date.now() + w * 30_000), c));
}
export const newTotpSecret = () => base32Encode(randomBytes(20));

/** Jeton de désinscription signé : pas de stockage, non devinable, non falsifiable. */
export function unsubscribeToken(subscriberId: number): string {
  const payload = Buffer.from(String(subscriberId)).toString('base64url');
  return `${payload}.${hmac(`unsub:${subscriberId}`).slice(0, 32)}`;
}
export function readUnsubscribeToken(token: string): number | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const id = Number(Buffer.from(payload, 'base64url').toString());
  if (!Number.isInteger(id) || id <= 0) return null;
  return safeEqual(hmac(`unsub:${id}`).slice(0, 32), sig) ? id : null;
}

/** Tronque une IP (preuve de consentement minimisée) : 192.168.1.42 → 192.168.1.0 */
export function truncateIp(ip?: string): string | null {
  if (!ip) return null;
  if (ip.includes('.')) return ip.replace(/^(?:::ffff:)?(\d+\.\d+\.\d+)\.\d+$/, '$1.0');
  return ip.split(':').slice(0, 3).join(':') + '::';
}
