// Envoi SMTP. En mode bac à sable (MAIL_SANDBOX=true), TOUT part vers la boîte de test
// locale (scripts/mail-catcher.mjs) : aucun message ne sort vers Internet.
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.ts';
import { query } from '../lib/db.ts';

export type DeliveryOutcome =
  | { status: 'accepted'; messageId: string; response: string }
  | { status: 'hard_bounce' | 'soft_fail'; error: string; code?: number };

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  headers?: Record<string, string>;
  kind: string;
  campaignId?: number | null;
}

let transporter: Transporter | null = null;

export function smtpConfigured(): boolean {
  return env.MAIL_SANDBOX || Boolean(env.SMTP_HOST);
}

export function smtpSummary() {
  if (env.MAIL_SANDBOX) {
    return { mode: 'sandbox', host: process.env.SANDBOX_SMTP_HOST ?? '127.0.0.1', port: Number(process.env.SANDBOX_SMTP_PORT ?? 1025), user: '', passwordSet: false, security: 'none' };
  }
  const mask = (s: string) => (s ? `${s.slice(0, 2)}•••${s.includes('@') ? s.slice(s.indexOf('@')) : ''}` : '');
  return { mode: 'real', host: env.SMTP_HOST, port: env.SMTP_PORT, user: mask(env.SMTP_USER), passwordSet: Boolean(env.SMTP_PASSWORD), security: env.SMTP_SECURITY };
}

export function getTransport(): Transporter {
  if (transporter) return transporter;
  if (env.MAIL_SANDBOX) {
    transporter = nodemailer.createTransport({
      host: process.env.SANDBOX_SMTP_HOST ?? '127.0.0.1',
      port: Number(process.env.SANDBOX_SMTP_PORT ?? 1025),
      secure: false, ignoreTLS: true,
    });
  } else {
    if (!env.SMTP_HOST) throw new Error('SMTP non configuré : renseignez SMTP_HOST dans les variables d\'environnement.');
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURITY === 'tls',
      requireTLS: env.SMTP_SECURITY === 'starttls',
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      pool: true, maxConnections: 3, maxMessages: 100,
      tls: { minVersion: 'TLSv1.2' },
    });
  }
  return transporter;
}

export async function verifySmtp(): Promise<{ ok: boolean; message: string }> {
  try {
    await getTransport().verify();
    return { ok: true, message: env.MAIL_SANDBOX ? 'Connexion à la boîte de test locale réussie (bac à sable).' : `Connexion SMTP réussie à ${env.SMTP_HOST}:${env.SMTP_PORT}.` };
  } catch (e: any) {
    return { ok: false, message: `Échec de connexion SMTP : ${e?.message ?? e}` };
  }
}

/** Classe une erreur SMTP : 5xx = refus permanent, 4xx/réseau = temporaire. */
export function classifySmtpError(e: any): DeliveryOutcome {
  const code: number | undefined = e?.responseCode;
  const msg = String(e?.response ?? e?.message ?? e).slice(0, 500);
  if (code && code >= 500 && code < 600) {
    // 5.1.x = adresse inexistante, 5.7.x = politique ; on traite les 55x comme permanents
    return { status: 'hard_bounce', error: msg, code };
  }
  return { status: 'soft_fail', error: msg, code };
}

export async function sendMail(m: OutgoingMail): Promise<DeliveryOutcome> {
  let outcome: DeliveryOutcome;
  try {
    const info = await getTransport().sendMail({
      from: { name: m.fromName, address: m.fromEmail },
      to: m.to,
      replyTo: m.replyTo || undefined,
      subject: m.subject,
      html: m.html,
      text: m.text,
      headers: m.headers,
    });
    // « Accepté » = accepté par le serveur d'envoi, PAS « livré dans la boîte ».
    outcome = { status: 'accepted', messageId: info.messageId, response: String(info.response ?? '') };
  } catch (e) {
    outcome = classifySmtpError(e);
  }
  await query(`INSERT INTO email_logs(kind, to_email, subject, campaign_id, status, message_id, smtp_response, error, sandbox)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
    m.kind, m.to, m.subject, m.campaignId ?? null,
    outcome.status === 'accepted' ? 'accepted' : outcome.status === 'hard_bounce' ? 'bounced' : 'failed',
    outcome.status === 'accepted' ? outcome.messageId : null,
    outcome.status === 'accepted' ? outcome.response.slice(0, 500) : null,
    outcome.status !== 'accepted' ? outcome.error : null,
    env.MAIL_SANDBOX,
  ]);
  return outcome;
}

export function resetTransportForTests() { transporter = null; }
