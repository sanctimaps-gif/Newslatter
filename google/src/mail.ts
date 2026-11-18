// Envoi par le compte Gmail du propriétaire du script, avec l'adresse IONOS configurée
// comme alias « Envoyer des e-mails en tant que » (le message transite par le SMTP d'IONOS).
import type { Db } from './db';

export interface Outgoing {
  to: string; subject: string; html: string; text: string; fromName: string; fromEmail: string; replyTo?: string;
  headers?: Record<string, string>; kind: string; campaignId?: number | null;
}
export type Outcome = { status: 'accepted'; messageId: string } | { status: 'hard_bounce' | 'soft_fail' | 'quota'; error: string };

export function accountEmail(): string { return String(Session.getEffectiveUser().getEmail() ?? ''); }
export function aliases(): string[] { try { return (GmailApp.getAliases() ?? []).map((a: string) => a.toLowerCase()); } catch { return []; } }
export function canSendAs(addr: string): boolean { const a = addr.toLowerCase(); return a === accountEmail().toLowerCase() || aliases().includes(a); }
export function gmailApiAvailable(): boolean { return typeof Gmail !== 'undefined' && Boolean(Gmail?.Users?.Messages); }

const b64 = (s: string) => Utilities.base64Encode(s, Utilities.Charset.UTF_8);
const encodeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap = (s: string) => s.replace(/(.{76})/g, '$1\r\n');

export function buildMime(m: Outgoing): string {
  const boundary = `snl_${Utilities.getUuid().replace(/-/g, '')}`;
  const headers = [
    `From: ${encodeWord(m.fromName.replace(/["\r\n]/g, ''))} <${m.fromEmail}>`,
    `To: ${m.to}`,
    `Subject: ${encodeWord(m.subject.replace(/[\r\n]/g, ' '))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    ...Object.entries(m.headers ?? {}).map(([k, v]) => `${k}: ${String(v).replace(/[\r\n]/g, ' ')}`),
  ];
  return [
    ...headers, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(m.text)),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(m.html)),
    `--${boundary}--`, '',
  ].join('\r\n');
}

function classify(e: any): Outcome {
  const msg = String(e?.message ?? e).slice(0, 500);
  if (/too many times|quota|limit exceeded|Limite/i.test(msg)) return { status: 'quota', error: msg };
  if (/invalid (email|to)|adresse.*(invalide|non valide)|Invalid argument: (to|recipient)/i.test(msg)) return { status: 'hard_bounce', error: msg };
  return { status: 'soft_fail', error: msg };
}

export function sendMail(db: Db, m: Outgoing): Outcome {
  let out: Outcome;
  try {
    if (!canSendAs(m.fromEmail)) throw new Error(`L'adresse ${m.fromEmail} n'est pas configurée dans Gmail (« Envoyer des e-mails en tant que »).`);
    if (gmailApiAvailable()) {
      // API Gmail : permet les en-têtes List-Unsubscribe (désinscription en un clic).
      const raw = Utilities.base64EncodeWebSafe(buildMime(m), Utilities.Charset.UTF_8);
      const res = Gmail.Users.Messages.send({ raw }, 'me');
      out = { status: 'accepted', messageId: String(res?.id ?? '') };
    } else {
      const opts: any = { htmlBody: m.html, name: m.fromName, replyTo: m.replyTo || undefined };
      if (m.fromEmail.toLowerCase() !== accountEmail().toLowerCase()) opts.from = m.fromEmail;
      GmailApp.sendEmail(m.to, m.subject, m.text, opts);
      out = { status: 'accepted', messageId: '' };
    }
  } catch (e) { out = classify(e); }
  db.insert('Journal', {
    kind: m.kind, to_email: m.to, subject: m.subject, campaign_id: m.campaignId ?? null,
    status: out.status === 'accepted' ? 'accepted' : out.status === 'hard_bounce' ? 'bounced' : 'failed',
    message_id: out.status === 'accepted' ? out.messageId : null, error: out.status !== 'accepted' ? out.error : null, created_at: new Date().toISOString(),
  });
  return out;
}

/** Envois du jour (compteur interne, en plus du quota Google). */
export function sentToday(db: Db): number {
  const day = new Date().toISOString().slice(0, 10);
  return db.all('Journal').filter((l) => l.status === 'accepted' && String(l.created_at).startsWith(day)).length;
}
export function googleQuota(): number | null { try { return MailApp.getRemainingDailyQuota(); } catch { return null; } }
