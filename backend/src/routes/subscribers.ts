import type { FastifyInstance } from 'fastify';
import { parse as parseCsv } from 'csv-parse/sync';
import { z } from 'zod';
import { truncateIp } from '../lib/crypto.ts';
import { one, query, tx } from '../lib/db.ts';
import { requireAuth } from '../middleware/auth.ts';
import { audit } from '../services/audit.ts';
import { enqueue } from '../services/queue.ts';
import { anonymize, emailSchema, exportSubscriberData, isSuppressed, nameSchema, STATUSES, unsubscribe } from '../services/subscribers.ts';
import { randomToken, sha256 } from '../lib/crypto.ts';

const listQuery = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(STATUSES).optional().or(z.literal('')),
  source: z.string().max(100).optional(),
  sort: z.enum(['created_desc', 'created_asc', 'email_asc', 'email_desc', 'name_asc', 'confirmed_desc']).default('created_desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(200).default(25),
});

const SORTS: Record<string, string> = {
  created_desc: 'created_at DESC', created_asc: 'created_at ASC', email_asc: 'email ASC', email_desc: 'email DESC',
  name_asc: 'first_name ASC NULLS LAST, email ASC', confirmed_desc: 'confirmed_at DESC NULLS LAST',
};

function csvEscape(v: unknown) {
  const s = v == null ? '' : String(v);
  // Protection contre l'injection de formules dans Excel/LibreOffice
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const HEADER_ALIASES: Record<string, string[]> = {
  email: ['email', 'e-mail', 'mail', 'courriel', 'adresse', 'adresse e-mail', 'adresse email', 'email address'],
  first_name: ['prenom', 'prénom', 'first name', 'firstname', 'first_name', 'given name'],
  last_name: ['nom', 'last name', 'lastname', 'last_name', 'nom de famille', 'surname'],
};
const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_-]+/g, ' ');

export default async function subscriberRoutes(app: FastifyInstance) {
  app.get('/api/admin/subscribers', { preHandler: requireAuth('viewer') }, async (req) => {
    const q = listQuery.parse(req.query);
    const where: string[] = ['anonymized_at IS NULL']; const params: unknown[] = [];
    if (q.q) { params.push(`%${q.q.replace(/[%_\\]/g, '\\$&')}%`); where.push(`(email ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    if (q.source) { params.push(q.source); where.push(`source = $${params.length}`); }
    const w = where.join(' AND ');
    const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM subscribers WHERE ${w}`, params);
    params.push(q.pageSize, (q.page - 1) * q.pageSize);
    const rows = await query(`SELECT id, email, first_name, last_name, status, source, tags, subscribed_at, confirmed_at, unsubscribed_at, created_at
      FROM subscribers WHERE ${w} ORDER BY ${SORTS[q.sort]} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const counts = await query(`SELECT status, count(*)::int AS n FROM subscribers WHERE anonymized_at IS NULL GROUP BY status`);
    return { rows, total: total!.n, page: q.page, pageSize: q.pageSize, counts: Object.fromEntries(counts.map((c: any) => [c.status, c.n])) };
  });

  app.get('/api/admin/subscribers/sources', { preHandler: requireAuth('viewer') }, async () =>
    (await query<{ source: string }>('SELECT DISTINCT source FROM subscribers ORDER BY source')).map((r) => r.source));

  app.get('/api/admin/subscribers/:id', { preHandler: requireAuth('viewer') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const s = await one('SELECT * FROM subscribers WHERE id=$1', [id]);
    if (!s) return reply.code(404).send({ error: 'Abonné introuvable.' });
    const consents = await query('SELECT action, consent_text, source, ip_truncated, created_at FROM consent_records WHERE subscriber_id=$1 ORDER BY created_at DESC', [id]);
    const campaigns = await query(`SELECT c.id, c.name, r.status, r.sent_at, r.last_error FROM campaign_recipients r JOIN campaigns c ON c.id=r.campaign_id WHERE r.subscriber_id=$1 ORDER BY r.created_at DESC LIMIT 50`, [id]);
    const events = await query(`SELECT event_type, created_at, detail FROM campaign_events WHERE subscriber_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]);
    return { subscriber: s, consents, campaigns, events };
  });

  // Ajout manuel : l'adresse reste « en attente » ; une invitation de confirmation peut être envoyée.
  app.post('/api/admin/subscribers', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const body = z.object({ email: emailSchema, firstName: nameSchema, lastName: nameSchema, tags: z.array(z.string().max(40)).max(20).default([]), notes: z.string().max(2000).optional().nullable(), sendConfirmation: z.boolean().default(true), consentNote: z.string().max(500).optional() }).parse(req.body);
    if (await one('SELECT 1 FROM subscribers WHERE email=$1', [body.email])) return reply.code(409).send({ error: 'Cette adresse existe déjà.' });
    const supp = await isSuppressed(body.email);
    if (supp) return reply.code(409).send({ error: `Cette adresse figure sur la liste d'exclusion (${supp}). Seule la personne elle-même peut se réinscrire via le formulaire.` });
    const s = await tx(async (c) => {
      const row = await one<any>(`INSERT INTO subscribers(email, first_name, last_name, tags, notes, source, status) VALUES ($1,$2,$3,$4,$5,'ajout-manuel','pending') RETURNING *`,
        [body.email, body.firstName, body.lastName, body.tags, body.notes ?? null], c);
      await query(`INSERT INTO consent_records(subscriber_id, action, consent_text, source, ip_truncated) VALUES ($1,'admin_add',$2,'ajout-manuel',$3)`, [row.id, body.consentNote ?? 'Ajout manuel par l\'administrateur', truncateIp(req.ip)], c);
      if (body.sendConfirmation) {
        const token = randomToken(32);
        await query(`INSERT INTO confirmation_tokens(subscriber_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '48 hours')`, [row.id, sha256(token)], c);
        await enqueue('email.confirmation', { subscriberId: row.id, token }, {}, c);
      }
      await audit(req.user!.id, 'subscriber.create', 'subscriber', row.id, { sendConfirmation: body.sendConfirmation }, req.ip, c);
      return row;
    });
    return reply.code(201).send(s);
  });

  app.patch('/api/admin/subscribers/:id', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z.object({
      firstName: nameSchema, lastName: nameSchema, tags: z.array(z.string().max(40)).max(20).optional(), notes: z.string().max(2000).optional().nullable(),
      // Le statut « confirmé » ne peut JAMAIS être posé à la main : seule la personne confirme.
      status: z.enum(['suspended', 'unsubscribed', 'restore']).optional(),
    }).parse(req.body);
    const s = await one<any>('SELECT * FROM subscribers WHERE id=$1 AND anonymized_at IS NULL', [id]);
    if (!s) return reply.code(404).send({ error: 'Abonné introuvable.' });
    await query(`UPDATE subscribers SET first_name=COALESCE($2, first_name), last_name=COALESCE($3, last_name), tags=COALESCE($4, tags), notes=COALESCE($5, notes), updated_at=now() WHERE id=$1`,
      [id, body.firstName, body.lastName, body.tags ?? null, body.notes ?? null]);
    if (body.status === 'suspended') await query(`UPDATE subscribers SET status='suspended', updated_at=now() WHERE id=$1`, [id]);
    if (body.status === 'unsubscribed') await unsubscribe(id, 'admin');
    if (body.status === 'restore') {
      // Lever une suspension : retour à « confirmé » uniquement si la personne avait confirmé et ne s'est pas désinscrite.
      if (s.status !== 'suspended') return reply.code(400).send({ error: 'Seule une adresse suspendue peut être rétablie.' });
      await query(`UPDATE subscribers SET status = CASE WHEN confirmed_at IS NOT NULL AND unsubscribed_at IS NULL THEN 'confirmed' ELSE 'pending' END, updated_at=now() WHERE id=$1`, [id]);
    }
    await audit(req.user!.id, 'subscriber.update', 'subscriber', id, body, req.ip);
    return one('SELECT * FROM subscribers WHERE id=$1', [id]);
  });

  app.delete('/api/admin/subscribers/:id', { preHandler: requireAuth('admin') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const ok = await anonymize(id);
    if (!ok) return reply.code(404).send({ error: 'Abonné introuvable ou déjà anonymisé.' });
    await audit(req.user!.id, 'subscriber.anonymize', 'subscriber', id, null, req.ip);
    return { ok: true };
  });

  app.get('/api/admin/subscribers/:id/export', { preHandler: requireAuth('admin') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const data = await exportSubscriberData(id);
    if (!data) return reply.code(404).send({ error: 'Abonné introuvable.' });
    await audit(req.user!.id, 'subscriber.export_personal_data', 'subscriber', id, null, req.ip);
    return reply.header('Content-Disposition', `attachment; filename="donnees-abonne-${id}.json"`).send(data);
  });

  app.get('/api/admin/subscribers-export.csv', { preHandler: requireAuth('admin') }, async (req, reply) => {
    const { status } = z.object({ status: z.enum(STATUSES).default('confirmed') }).parse(req.query);
    const rows = await query(`SELECT email, first_name, last_name, status, source, subscribed_at, confirmed_at, unsubscribed_at FROM subscribers WHERE status=$1 AND anonymized_at IS NULL ORDER BY id`, [status]);
    const head = ['email', 'prenom', 'nom', 'statut', 'source', 'inscription', 'confirmation', 'desinscription'];
    const csv = [head.join(';'), ...rows.map((r: any) => [r.email, r.first_name, r.last_name, r.status, r.source, r.subscribed_at?.toISOString?.(), r.confirmed_at?.toISOString?.() ?? '', r.unsubscribed_at?.toISOString?.() ?? ''].map(csvEscape).join(';'))].join('\n');
    await audit(req.user!.id, 'subscriber.export_csv', 'subscriber', null, { status, count: rows.length }, req.ip);
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="abonnes-${status}.csv"`).send('﻿' + csv);
  });

  // ─── Import CSV : 1) analyse et aperçu ───
  app.post('/api/admin/subscribers/import/preview', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Aucun fichier reçu.' });
    if (!/\.(csv|txt)$/i.test(file.filename)) return reply.code(400).send({ error: 'Le fichier doit être au format .csv.' });
    const buf = await file.toBuffer();
    if (buf.length > 2 * 1024 * 1024) return reply.code(400).send({ error: 'Fichier trop volumineux (2 Mo maximum).' });
    if (buf.includes(0)) return reply.code(400).send({ error: 'Le fichier ne semble pas être un fichier texte CSV.' });
    const text = buf.toString('utf8').replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] ?? '';
    const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') ? '\t' : ',';
    let records: string[][];
    try { records = parseCsv(text, { delimiter, skip_empty_lines: true, relax_column_count: true, trim: true }); }
    catch (e: any) { return reply.code(400).send({ error: `Lecture impossible : ${e.message}` }); }
    if (records.length < 1) return reply.code(400).send({ error: 'Fichier vide.' });
    if (records.length > 10001) return reply.code(400).send({ error: '10 000 lignes maximum par import.' });

    const header = records[0].map(norm);
    const mapping: Record<string, number> = {};
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      const idx = header.findIndex((h) => aliases.map(norm).includes(h));
      if (idx >= 0) mapping[field] = idx;
    }
    let dataRows = records.slice(1);
    if (mapping.email === undefined) {
      // Pas d'en-tête reconnu : on cherche une colonne qui contient des adresses
      const idx = records[0].findIndex((c) => emailSchema.safeParse(c).success);
      if (idx < 0) return reply.code(400).send({ error: 'Aucune colonne « email » détectée.' });
      mapping.email = idx; dataRows = records;
    }
    const existing = new Map((await query<{ email: string; status: string }>('SELECT email, status FROM subscribers')).map((r) => [r.email.toLowerCase(), r.status]));
    const seen = new Set<string>();
    const rows = [];
    for (const [i, r] of dataRows.entries()) {
      const raw = (r[mapping.email] ?? '').trim();
      const parsed = emailSchema.safeParse(raw);
      const email = parsed.success ? parsed.data : raw;
      let status: 'ok' | 'invalid' | 'duplicate_file' | 'exists' | 'suppressed' = 'ok';
      let note = '';
      if (!parsed.success) { status = 'invalid'; note = 'Adresse invalide'; }
      else if (seen.has(email)) { status = 'duplicate_file'; note = 'Doublon dans le fichier'; }
      else {
        const supp = await isSuppressed(email);
        if (supp) { status = 'suppressed'; note = `Liste d'exclusion (${supp})`; }
        else if (existing.has(email)) { status = 'exists'; note = `Déjà présent (${existing.get(email)})`; }
      }
      seen.add(email);
      rows.push({ line: i + (dataRows === records ? 1 : 2), email, firstName: mapping.first_name !== undefined ? (r[mapping.first_name] ?? '').slice(0, 80) : '', lastName: mapping.last_name !== undefined ? (r[mapping.last_name] ?? '').slice(0, 80) : '', status, note });
    }
    const summary = rows.reduce((a: Record<string, number>, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
    return { filename: file.filename, delimiter, columns: records[0], mapping, summary, total: rows.length, rows };
  });

  // ─── Import CSV : 2) validation par l'administrateur ───
  app.post('/api/admin/subscribers/import/commit', { preHandler: requireAuth('editor') }, async (req) => {
    const body = z.object({
      rows: z.array(z.object({ email: z.string(), firstName: z.string().max(80).optional(), lastName: z.string().max(80).optional() })).max(10000),
      sourceLabel: z.string().trim().min(1).max(60),
      consentNote: z.string().trim().min(10, 'Décrivez l\'origine du consentement (10 caractères minimum).').max(500),
      sendConfirmation: z.boolean(),
    }).parse(req.body);
    const result = { imported: 0, skipped: 0 };
    const source = `import:${body.sourceLabel.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 50)}`;
    await tx(async (c) => {
      for (const r of body.rows) {
        const e = emailSchema.safeParse(r.email);
        if (!e.success || (await isSuppressed(e.data, c))) { result.skipped++; continue; }
        // Toujours « en attente » : un import ne crée JAMAIS d'abonné confirmé.
        const s = await one<{ id: number }>(`INSERT INTO subscribers(email, first_name, last_name, status, source) VALUES ($1,$2,$3,'pending',$4) ON CONFLICT (email) DO NOTHING RETURNING id`,
          [e.data, nameSchema.safeParse(r.firstName).data ?? null, nameSchema.safeParse(r.lastName).data ?? null, source], c);
        if (!s) { result.skipped++; continue; }
        await query(`INSERT INTO consent_records(subscriber_id, action, consent_text, source) VALUES ($1,'import',$2,$3)`, [s.id, body.consentNote, source], c);
        if (body.sendConfirmation) {
          const token = randomToken(32);
          await query(`INSERT INTO confirmation_tokens(subscriber_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '48 hours')`, [s.id, sha256(token)], c);
          await enqueue('email.confirmation', { subscriberId: s.id, token, reason: 'import' }, {}, c);
        }
        result.imported++;
      }
      await audit(req.user!.id, 'subscriber.import', 'subscriber', null, { ...result, source, sendConfirmation: body.sendConfirmation }, req.ip, c);
    });
    return result;
  });

  // ─── Segments ───
  app.get('/api/admin/segments', { preHandler: requireAuth('viewer') }, async () => query('SELECT * FROM segments ORDER BY name'));
  app.post('/api/admin/segments', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(80), rules: z.object({ sources: z.array(z.string()).optional(), tags: z.array(z.string()).optional(), confirmedAfter: z.string().optional(), confirmedBefore: z.string().optional() }) }).parse(req.body);
    return reply.code(201).send(await one('INSERT INTO segments(name, rules) VALUES ($1,$2) RETURNING *', [body.name, JSON.stringify(body.rules)]));
  });
  app.delete('/api/admin/segments/:id', { preHandler: requireAuth('editor') }, async (req) => {
    await query('DELETE FROM segments WHERE id=$1', [Number((req.params as any).id)]);
    return { ok: true };
  });
}
