// Cryptographie avec les seuls outils d'Apps Script (Utilities).
type Bytes = number[];

const toUnsigned = (b: Bytes) => b.map((x) => (x < 0 ? x + 256 : x));
const toSigned = (b: Bytes) => b.map((x) => (x > 127 ? x - 256 : x));
export const hex = (b: Bytes) => toUnsigned(b).map((x) => x.toString(16).padStart(2, '0')).join('');
const utf8 = (s: string): Bytes => Utilities.newBlob(s).getBytes();

export function sha256(s: string): string {
  return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}

function hmacBytes(value: Bytes, key: Bytes): Bytes {
  return Utilities.computeHmacSha256Signature(toSigned(value), toSigned(key));
}

/** HMAC-SHA256 avec le secret du projet (empreintes, signatures de liens). */
export function hmac(s: string, secret: string): string {
  return hex(hmacBytes(utf8(s), utf8(secret)));
}

/** Jeton aléatoire (2 UUID v4 issus d'un générateur cryptographique ≈ 244 bits). */
export function randomToken(): string {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/** PBKDF2-HMAC-SHA256 (hachage des mots de passe). */
export function pbkdf2(password: string, saltHex: string, iterations: number): string {
  const P = utf8(password);
  const salt = (saltHex.match(/../g) ?? []).map((h) => parseInt(h, 16));
  let u = hmacBytes([...salt, 0, 0, 0, 1], P).map((x) => (x < 0 ? x + 256 : x));
  const t = u.slice();
  for (let i = 1; i < iterations; i++) {
    u = hmacBytes(u, P).map((x) => (x < 0 ? x + 256 : x));
    for (let j = 0; j < t.length; j++) t[j] ^= u[j];
  }
  return hex(t);
}

export const ITERATIONS = 5000;
export function hashPassword(pw: string): string {
  const salt = sha256(randomToken()).slice(0, 32);
  return `pbkdf2$${ITERATIONS}$${salt}$${pbkdf2(pw, salt, ITERATIONS)}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, it, salt, h] = String(stored ?? '').split('$');
  if (alg !== 'pbkdf2') return false;
  return safeEqual(pbkdf2(pw, salt, Number(it)), h);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ─── TOTP (RFC 6238) ───
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret(): string {
  const bytes = (sha256(randomToken()).match(/../g) ?? []).slice(0, 20).map((h) => parseInt(h, 16));
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  return out;
}
function b32decode(s: string): Bytes {
  let bits = 0, value = 0; const out: Bytes = [];
  for (const ch of s.toUpperCase()) { const i = B32.indexOf(ch); if (i < 0) continue; value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return out;
}
export function totpCode(secret: string, time = Date.now()): string {
  let counter = Math.floor(time / 30000);
  const msg: Bytes = [];
  for (let i = 7; i >= 0; i--) { msg[i] = counter & 255; counter = Math.floor(counter / 256); }
  const h = toUnsigned(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, toSigned(msg), toSigned(b32decode(secret))));
  const o = h[h.length - 1] & 15;
  const code = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000;
  return String(code).padStart(6, '0');
}
export function verifyTotp(secret: string, code: string): boolean {
  const c = String(code).replace(/\s/g, '');
  return /^\d{6}$/.test(c) && [-1, 0, 1].some((w) => safeEqual(totpCode(secret, Date.now() + w * 30000), c));
}
