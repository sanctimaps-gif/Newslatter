import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { hashPassword } from '../src/lib/crypto.ts';
import { pool, query } from '../src/lib/db.ts';
import { migrate } from '../src/scripts/migrate.ts';
import { seed } from '../src/scripts/seed.ts';

export interface CapturedMail { to: string[]; subject: string; html: string; text: string; headers: Map<string, any>; raw: string }
export const inbox: CapturedMail[] = [];
let smtp: SMTPServer | null = null;

export async function startSmtp() {
  if (smtp) return;
  smtp = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
    onRcptTo(addr, _s, cb) {
      if (/rebond/.test(addr.address)) return cb(Object.assign(new Error('5.1.1 User unknown'), { responseCode: 550 }));
      if (/temporaire/.test(addr.address)) return cb(Object.assign(new Error('4.2.2 Mailbox full'), { responseCode: 451 }));
      cb();
    },
    onData(stream, session, cb) {
      const chunks: Buffer[] = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', async () => {
        const raw = Buffer.concat(chunks);
        const p = await simpleParser(raw);
        inbox.push({ to: session.envelope.rcptTo.map((r) => r.address), subject: p.subject ?? '', html: String(p.html || ''), text: p.text ?? '', headers: p.headers, raw: raw.toString('utf8') });
        cb();
      });
    },
  });
  await new Promise<void>((r) => smtp!.listen(2525, '127.0.0.1', () => r()));
}

export async function resetDb() {
  await migrate(() => {});
  await query(`TRUNCATE users, sessions, password_resets, subscribers, confirmation_tokens, consent_records, suppressions, newsletters, newsletter_blocks,
    segments, campaigns, campaign_recipients, campaign_links, campaign_events, scheduled_jobs, email_logs, media_files, automation_runs, audit_logs, newsletter_templates RESTART IDENTITY CASCADE`);
  await query(`DELETE FROM settings`);
  await query(`UPDATE automations SET enabled = (key = 'purge_unconfirmed')`);
  await seed(() => {});
  inbox.length = 0;
}

export async function createUser(email: string, role: 'admin' | 'editor' | 'viewer', password = 'MotDePasseSolide2026') {
  await query('INSERT INTO users(email, display_name, role, password_hash) VALUES ($1,$2,$3,$4)', [email, email.split('@')[0], role, await hashPassword(password)]);
}

export class Client {
  cookie = ''; csrf = '';
  constructor(public app: FastifyInstance) {}
  async req(method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.inject({
      method: method as any, url, payload: payload as any,
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(this.csrf && method !== 'GET' ? { 'x-csrf-token': this.csrf } : {}), ...headers },
    });
    const set = res.headers['set-cookie'];
    if (set) { const c = (Array.isArray(set) ? set : [set]).find((x) => x.startsWith('snl_session=')); if (c) this.cookie = c.split(';')[0]; }
    let body: any = res.body;
    try { body = res.json(); } catch { /* texte */ }
    return { status: res.statusCode, body, headers: res.headers };
  }
  async login(email: string, password = 'MotDePasseSolide2026') {
    const r = await this.req('POST', '/api/auth/login', { email, password });
    if (r.body?.csrfToken) this.csrf = r.body.csrfToken;
    return r;
  }
}

export async function makeApp() { return buildApp(); }
export async function closeAll(app?: FastifyInstance) { await app?.close(); }
export { pool };
