import type { FastifyInstance } from 'fastify';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { renderEmail, type EmailDesign } from '../../../shared/src/index.ts';
import { env } from '../config/env.ts';
import { randomToken } from '../lib/crypto.ts';
import { one, query, tx, type Queryable } from '../lib/db.ts';
import { requireAuth } from '../middleware/auth.ts';
import { audit } from '../services/audit.ts';
import { getSettings } from '../services/settings.ts';

const blockSchema = z.object({
  id: z.string().max(60),
  type: z.enum(['header', 'heading', 'subheading', 'text', 'image', 'imageText', 'article', 'section', 'button', 'link', 'divider', 'spacer', 'columns2', 'columns3', 'list', 'quote', 'footer']),
  props: z.record(z.string(), z.any()),
});
export const designSchema = z.object({
  settings: z.object({
    backgroundColor: z.string().max(20), contentBackground: z.string().max(20), textColor: z.string().max(20), linkColor: z.string().max(20),
    accentColor: z.string().max(20), fontFamily: z.enum(['serif', 'sans']), width: z.number().min(480).max(720), preheader: z.string().max(200).optional(),
  }),
  blocks: z.array(blockSchema).max(80),
}).refine((d) => JSON.stringify(d).length < 400_000, 'Contenu trop volumineux.');

async function syncBlocks(newsletterId: number, design: EmailDesign, c: Queryable) {
  await query('DELETE FROM newsletter_blocks WHERE newsletter_id=$1', [newsletterId], c);
  for (const [i, b] of design.blocks.entries()) {
    await query('INSERT INTO newsletter_blocks(newsletter_id, position, block_type, data) VALUES ($1,$2,$3,$4)', [newsletterId, i, b.type, JSON.stringify(b.props)], c);
  }
}

// Signatures binaires : on ne fait pas confiance au type MIME annoncé par le navigateur.
function sniffImage(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

async function processImage(buf: Buffer) {
  const mime = sniffImage(buf);
  if (!mime) throw Object.assign(new Error('Format non autorisé : PNG, JPEG, GIF ou WebP uniquement.'), { statusCode: 400 });
  if (mime === 'image/gif') {
    const meta = await sharp(buf, { animated: true }).metadata();
    return { data: buf, mime, ext: 'gif', width: meta.width ?? null, height: meta.pageHeight ?? meta.height ?? null };
  }
  // Optimisation raisonnable : 1200 px max, métadonnées (EXIF/GPS) supprimées, ré-encodage.
  const img = sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1200, withoutEnlargement: true });
  const out = mime === 'image/png' ? await img.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    : await img.jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { data: out.data, mime: mime === 'image/png' ? 'image/png' : 'image/jpeg', ext: mime === 'image/png' ? 'png' : 'jpg', width: out.info.width, height: out.info.height };
}

export const mediaUrl = (filename: string) => `${env.PUBLIC_URL}/media/${filename}`;

export default async function contentRoutes(app: FastifyInstance) {
  // ─── Newsletters (contenus) ───
  app.get('/api/admin/newsletters', { preHandler: requireAuth('viewer') }, async () =>
    query(`SELECT n.id, n.title, n.created_at, n.updated_at, jsonb_array_length(n.design->'blocks') AS block_count,
      (SELECT count(*)::int FROM campaigns c WHERE c.newsletter_id=n.id) AS campaign_count FROM newsletters n ORDER BY n.updated_at DESC`));
  app.get('/api/admin/newsletters/:id', { preHandler: requireAuth('viewer') }, async (req, reply) => {
    const n = await one('SELECT * FROM newsletters WHERE id=$1', [Number((req.params as any).id)]);
    return n ?? reply.code(404).send({ error: 'Newsletter introuvable.' });
  });
  app.post('/api/admin/newsletters', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const body = z.object({ title: z.string().trim().min(1).max(150), design: designSchema, templateId: z.number().optional().nullable() }).parse(req.body);
    const n = await tx(async (c) => {
      const row = await one<any>('INSERT INTO newsletters(title, design, template_id, created_by) VALUES ($1,$2,$3,$4) RETURNING *', [body.title, JSON.stringify(body.design), body.templateId ?? null, req.user!.id], c);
      await syncBlocks(row.id, body.design as EmailDesign, c);
      return row;
    });
    await audit(req.user!.id, 'newsletter.create', 'newsletter', n.id, null, req.ip);
    return reply.code(201).send(n);
  });
  app.put('/api/admin/newsletters/:id', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = z.object({ title: z.string().trim().min(1).max(150), design: designSchema }).parse(req.body);
    const n = await tx(async (c) => {
      const row = await one('UPDATE newsletters SET title=$2, design=$3, updated_at=now() WHERE id=$1 RETURNING *', [id, body.title, JSON.stringify(body.design)], c);
      if (row) await syncBlocks(id, body.design as EmailDesign, c);
      return row;
    });
    return n ?? reply.code(404).send({ error: 'Newsletter introuvable.' });
  });
  app.post('/api/admin/newsletters/:id/duplicate', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const n = await one<any>('SELECT * FROM newsletters WHERE id=$1', [Number((req.params as any).id)]);
    if (!n) return reply.code(404).send({ error: 'Newsletter introuvable.' });
    const copy = await tx(async (c) => {
      const row = await one<any>('INSERT INTO newsletters(title, design, template_id, created_by) VALUES ($1,$2,$3,$4) RETURNING *', [`${n.title} (copie)`, JSON.stringify(n.design), n.template_id, req.user!.id], c);
      await syncBlocks(row.id, n.design, c);
      return row;
    });
    return reply.code(201).send(copy);
  });
  app.delete('/api/admin/newsletters/:id', { preHandler: requireAuth('editor') }, async (req) => {
    const id = Number((req.params as any).id);
    await query('DELETE FROM newsletters WHERE id=$1', [id]);
    await audit(req.user!.id, 'newsletter.delete', 'newsletter', id, null, req.ip);
    return { ok: true };
  });

  // ─── Modèles ───
  app.get('/api/admin/templates', { preHandler: requireAuth('viewer') }, async () =>
    query('SELECT id, name, description, category, is_system, design, created_at, updated_at FROM newsletter_templates ORDER BY is_system DESC, id'));
  app.get('/api/admin/templates/:id', { preHandler: requireAuth('viewer') }, async (req, reply) =>
    (await one('SELECT * FROM newsletter_templates WHERE id=$1', [Number((req.params as any).id)])) ?? reply.code(404).send({ error: 'Modèle introuvable.' }));
  app.post('/api/admin/templates', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(300).optional(), design: designSchema }).parse(req.body);
    const t = await one<any>(`INSERT INTO newsletter_templates(name, description, category, design, created_by) VALUES ($1,$2,'personnalise',$3,$4) RETURNING *`, [body.name, body.description ?? '', JSON.stringify(body.design), req.user!.id]);
    await audit(req.user!.id, 'template.create', 'template', t.id, null, req.ip);
    return reply.code(201).send(t);
  });
  app.put('/api/admin/templates/:id', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(300).optional(), design: designSchema }).parse(req.body);
    const t = await one('UPDATE newsletter_templates SET name=$2, description=$3, design=$4, updated_at=now() WHERE id=$1 RETURNING *', [Number((req.params as any).id), body.name, body.description ?? '', JSON.stringify(body.design)]);
    return t ?? reply.code(404).send({ error: 'Modèle introuvable.' });
  });
  app.post('/api/admin/templates/:id/duplicate', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const t = await one<any>('SELECT * FROM newsletter_templates WHERE id=$1', [Number((req.params as any).id)]);
    if (!t) return reply.code(404).send({ error: 'Modèle introuvable.' });
    return reply.code(201).send(await one(`INSERT INTO newsletter_templates(name, description, category, design, created_by) VALUES ($1,$2,'personnalise',$3,$4) RETURNING *`, [`${t.name} (copie)`, t.description, JSON.stringify(t.design), req.user!.id]));
  });
  app.delete('/api/admin/templates/:id', { preHandler: requireAuth('editor') }, async (req) => {
    const id = Number((req.params as any).id);
    await query('DELETE FROM newsletter_templates WHERE id=$1', [id]);
    await audit(req.user!.id, 'template.delete', 'template', id, null, req.ip);
    return { ok: true };
  });

  // ─── Rendu (aperçu identique à l'envoi) ───
  app.post('/api/admin/render', { preHandler: requireAuth('viewer', { self: true }), config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const body = z.object({ design: designSchema, subject: z.string().max(200).default('Aperçu'), preheader: z.string().max(200).optional(), sample: z.boolean().default(true) }).parse(req.body);
    const s = await getSettings();
    return renderEmail(body.design as EmailDesign, { subject: body.subject, preheader: body.preheader, sampleData: body.sample, firstName: null, unsubscribeUrl: `${env.PUBLIC_URL}/desinscription?t=exemple`, privacyUrl: `${env.PUBLIC_URL}/confidentialite`, legalText: s.organization.legalText });
  });

  // ─── Médiathèque ───
  app.get('/api/admin/media', { preHandler: requireAuth('viewer') }, async () =>
    (await query<any>('SELECT * FROM media_files ORDER BY created_at DESC')).map((m) => ({ ...m, url: mediaUrl(m.filename) })));

  app.post('/api/admin/media', { preHandler: requireAuth('editor'), config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Aucun fichier reçu.' });
    const buf = await file.toBuffer();
    if (file.file.truncated) return reply.code(400).send({ error: 'Image trop lourde (5 Mo maximum).' });
    const img = await processImage(buf);
    const filename = `${new Date().toISOString().slice(0, 7)}-${randomToken(12)}.${img.ext}`;
    await writeFile(join(env.MEDIA_DIR, filename), img.data, { mode: 0o644 });
    const alt = String((file.fields as any)?.alt?.value ?? '').slice(0, 300);
    const m = await one<any>(`INSERT INTO media_files(filename, original_name, mime_type, size_bytes, width, height, alt_text, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [filename, file.filename.slice(0, 200), img.mime, img.data.length, img.width, img.height, alt, req.user!.id]);
    await audit(req.user!.id, 'media.upload', 'media', m.id, { size: img.data.length }, req.ip);
    return reply.code(201).send({ ...m, url: mediaUrl(filename) });
  });

  app.post('/api/admin/media/:id/replace', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const m = await one<any>('SELECT * FROM media_files WHERE id=$1', [id]);
    if (!m) return reply.code(404).send({ error: 'Image introuvable.' });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Aucun fichier reçu.' });
    const img = await processImage(await file.toBuffer());
    const filename = `${new Date().toISOString().slice(0, 7)}-${randomToken(12)}.${img.ext}`;
    await writeFile(join(env.MEDIA_DIR, filename), img.data, { mode: 0o644 });
    // L'ancien fichier est conservé : il peut figurer dans des e-mails déjà envoyés.
    const updated = await one<any>(`UPDATE media_files SET filename=$2, original_name=$3, mime_type=$4, size_bytes=$5, width=$6, height=$7 WHERE id=$1 RETURNING *`,
      [id, filename, file.filename.slice(0, 200), img.mime, img.data.length, img.width, img.height]);
    return { ...updated, url: mediaUrl(filename), previousUrl: mediaUrl(m.filename) };
  });

  app.patch('/api/admin/media/:id', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const { alt } = z.object({ alt: z.string().max(300) }).parse(req.body);
    const m = await one<any>('UPDATE media_files SET alt_text=$2 WHERE id=$1 RETURNING *', [Number((req.params as any).id), alt]);
    return m ? { ...m, url: mediaUrl(m.filename) } : reply.code(404).send({ error: 'Image introuvable.' });
  });

  app.delete('/api/admin/media/:id', { preHandler: requireAuth('editor') }, async (req, reply) => {
    const m = await one<any>('DELETE FROM media_files WHERE id=$1 RETURNING *', [Number((req.params as any).id)]);
    if (!m) return reply.code(404).send({ error: 'Image introuvable.' });
    if (/^[\w.-]+$/.test(m.filename)) await unlink(join(env.MEDIA_DIR, m.filename)).catch(() => undefined);
    await audit(req.user!.id, 'media.delete', 'media', m.id, null, req.ip);
    return { ok: true };
  });
}
