import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createBlock, DEFAULT_SETTINGS, renderEmail } from '../../shared/src/index.ts';
import { one, query } from '../src/lib/db.ts';
import { promoteDueCampaigns, recipientToken } from '../src/services/campaigns.ts';
import { drain } from '../../worker/src/index.ts';
import { markUncertainRecipients } from '../../worker/src/processors/campaign.ts';
import { Client, closeAll, createUser, inbox, makeApp, resetDb, startSmtp } from './helpers.ts';
import { env } from '../src/config/env.ts';

let app: FastifyInstance;
let admin: Client;

const design = () => {
  const t = createBlock('text'); t.props.text = 'Bonjour {{prenom|ami}}, voir [la carte](https://sanctimaps.fr/).';
  const b = createBlock('button'); b.props.url = 'https://sanctimaps.fr/saints/';
  return { settings: { ...DEFAULT_SETTINGS }, blocks: [createBlock('heading'), t, b, createBlock('footer')] };
};
const campaign = (extra: object = {}) => ({ name: 'Lettre test', subject: 'Le saint du jour', fromName: 'SanctiMaps', fromEmail: 'newsletter@sanctimaps.fr', replyTo: 'contact@sanctimaps.fr', design: design(), audience: { type: 'all' }, ...extra });

async function addSub(email: string, status: string, firstName: string | null = null) {
  return (await one<any>(`INSERT INTO subscribers(email, first_name, status, source, confirmed_at) VALUES ($1,$2,$3,'test', CASE WHEN $3='confirmed' THEN now() END) RETURNING id`, [email, firstName, status])).id;
}

beforeAll(async () => {
  await startSmtp(); await resetDb(); app = await makeApp();
  await createUser('admin@sanctimaps.fr', 'admin');
  admin = new Client(app); await admin.login('admin@sanctimaps.fr');
  await addSub('a@exemple.fr', 'confirmed', 'Alice');
  await addSub('b@exemple.fr', 'confirmed');
  await addSub('rebond@exemple.fr', 'confirmed');
  await addSub('attente@exemple.fr', 'pending');
  await addSub('parti@exemple.fr', 'unsubscribed');
  await addSub('suspendu@exemple.fr', 'suspended');
  await addSub('erreur@exemple.fr', 'bounced');
});
afterAll(() => closeAll(app));

describe('Campagnes', () => {
  it('impose une adresse d\'expédition du domaine sanctimaps.fr', async () => {
    expect((await admin.req('POST', '/api/admin/campaigns', campaign({ fromEmail: 'moi@gmail.com' }))).status).toBe(400);
  });

  it('compte exactement les destinataires éligibles (confirmés uniquement)', async () => {
    const r = await admin.req('POST', '/api/admin/audience/count', { audience: { type: 'all' } });
    expect(r.body.count).toBe(3);
  });

  it('envoie un e-mail de test à l\'adresse indiquée seulement', async () => {
    const c = await admin.req('POST', '/api/admin/campaigns', campaign());
    inbox.length = 0;
    const t = await admin.req('POST', `/api/admin/campaigns/${c.body.id}/test`, { to: 'admin@sanctimaps.fr' });
    expect(t.body.status).toBe('accepted');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].subject).toBe('[TEST] Le saint du jour');
    expect(await one('SELECT 1 FROM campaign_recipients')).toBeNull();
  });

  it('exige une confirmation explicite avant l\'envoi', async () => {
    const c = await one<any>('SELECT id FROM campaigns LIMIT 1');
    expect((await admin.req('POST', `/api/admin/campaigns/${c.id}/send`, { mode: 'now' })).status).toBe(400);
  });

  it('envoie via la file : confirmés uniquement, personnalisé, en-têtes de désinscription, rebond traité', async () => {
    const c = await one<any>('SELECT id FROM campaigns LIMIT 1');
    inbox.length = 0;
    const r = await admin.req('POST', `/api/admin/campaigns/${c.id}/send`, { mode: 'now', confirm: true });
    expect(r.status).toBe(200);
    expect(r.body.recipients).toBe(3);
    expect(inbox).toHaveLength(0); // rien n'est envoyé par l'API elle-même
    await drain();
    const to = inbox.flatMap((m) => m.to).sort();
    expect(to).toEqual(['a@exemple.fr', 'b@exemple.fr']);
    const alice = inbox.find((m) => m.to.includes('a@exemple.fr'))!;
    expect(alice.text).toContain('Bonjour Alice,');
    expect(inbox.find((m) => m.to.includes('b@exemple.fr'))!.text).toContain('Bonjour ami,');
    const rawHeaders = alice.raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n\s+/g, ' ');
    expect(rawHeaders).toMatch(/^List-Unsubscribe: <http[^>]+\/api\/public\/unsubscribe\/one-click\?t=[^>]+>, <mailto:contact@sanctimaps\.fr\?subject=unsubscribe>$/m);
    expect(rawHeaders).toMatch(/^List-Unsubscribe-Post: List-Unsubscribe=One-Click$/m);
    expect(alice.html).toMatch(/\/r\/[a-z0-9]+\.[\w-]+\/\d+/); // liens suivis
    const camp = await one<any>('SELECT status, recipient_count FROM campaigns WHERE id=$1', [c.id]);
    expect(camp.status).toBe('sent');
    const rows = await query<any>('SELECT email, status FROM campaign_recipients WHERE campaign_id=$1 ORDER BY email', [c.id]);
    expect(rows).toEqual([{ email: 'a@exemple.fr', status: 'accepted' }, { email: 'b@exemple.fr', status: 'accepted' }, { email: 'rebond@exemple.fr', status: 'bounced' }]);
    expect((await one<any>(`SELECT status FROM subscribers WHERE email='rebond@exemple.fr'`)).status).toBe('bounced');
    expect(await one(`SELECT 1 FROM suppressions WHERE reason='hard_bounce'`)).toBeTruthy();
  });

  it('n\'envoie jamais deux fois (relance de la préparation et des lots)', async () => {
    const c = await one<any>('SELECT id FROM campaigns LIMIT 1');
    const before = inbox.length;
    await query(`UPDATE campaigns SET status='queued' WHERE id=$1`, [c.id]);
    await query(`INSERT INTO scheduled_jobs(job_type, payload) VALUES ('campaign.prepare', $1), ('campaign.send_batch', $1)`, [JSON.stringify({ campaignId: c.id })]);
    await drain();
    expect(inbox.length).toBe(before);
    expect((await one<any>('SELECT count(*)::int AS n FROM campaign_recipients WHERE campaign_id=$1', [c.id])).n).toBe(3);
  });

  it('enregistre un clic réel puis redirige', async () => {
    const r = await one<any>(`SELECT id, campaign_id FROM campaign_recipients WHERE email='a@exemple.fr'`);
    const link = await one<any>('SELECT id, url FROM campaign_links WHERE campaign_id=$1 ORDER BY id LIMIT 1', [r.campaign_id]);
    const res = await app.inject({ method: 'GET', url: `/r/${recipientToken(r.id)}/${link.id}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(link.url);
    const forged = await app.inject({ method: 'GET', url: `/r/${r.id.toString(36)}.faux/${link.id}` });
    expect(forged.statusCode).toBe(302);
    const stats = await admin.req('GET', `/api/admin/campaigns/${r.campaign_id}`);
    expect(stats.body.stats.clicks).toBe(1); // le jeton falsifié n'est pas compté
    expect(stats.body.stats.accepted).toBe(2);
    expect(stats.body.stats.click_rate).toBe(50);
  });

  it('programme, ne déclenche pas avant l\'heure, puis envoie à l\'échéance ; annulation possible', async () => {
    const c = await admin.req('POST', '/api/admin/campaigns', campaign({ name: 'Programmée' }));
    const past = await admin.req('POST', `/api/admin/campaigns/${c.body.id}/send`, { mode: 'schedule', scheduledAt: new Date(Date.now() - 3600_000).toISOString(), confirm: true });
    expect(past.status).toBe(400);
    const when = new Date(Date.now() + 3600_000).toISOString();
    const s = await admin.req('POST', `/api/admin/campaigns/${c.body.id}/send`, { mode: 'schedule', scheduledAt: when, timezone: 'Europe/Paris', confirm: true });
    expect(s.body.campaign.status).toBe('scheduled');
    expect(await promoteDueCampaigns()).toEqual([]);
    await query(`UPDATE campaigns SET scheduled_at = now() - interval '1 second' WHERE id=$1`, [c.body.id]);
    const before = inbox.length;
    expect(await promoteDueCampaigns()).toEqual([c.body.id]);
    expect(await promoteDueCampaigns()).toEqual([]); // jamais promue deux fois
    await drain();
    expect(inbox.length - before).toBe(2);

    const c2 = await admin.req('POST', '/api/admin/campaigns', campaign({ name: 'À annuler' }));
    await admin.req('POST', `/api/admin/campaigns/${c2.body.id}/send`, { mode: 'schedule', scheduledAt: when, confirm: true });
    const cancel = await admin.req('POST', `/api/admin/campaigns/${c2.body.id}/cancel`, {});
    expect(cancel.body.status).toBe('cancelled');
  });

  it('exclut au dernier moment un abonné désinscrit pendant l\'envoi', async () => {
    const c = await admin.req('POST', '/api/admin/campaigns', campaign({ name: 'Course' }));
    await admin.req('POST', `/api/admin/campaigns/${c.body.id}/send`, { mode: 'now', confirm: true });
    const prep = await query<any>(`SELECT * FROM scheduled_jobs WHERE job_type='campaign.prepare' AND status='pending'`);
    expect(prep.length).toBe(1);
    const { prepareCampaign } = await import('../src/services/campaigns.ts');
    await prepareCampaign(c.body.id);
    await query(`UPDATE scheduled_jobs SET status='done' WHERE id=$1`, [prep[0].id]);
    await query(`UPDATE subscribers SET status='unsubscribed' WHERE email='b@exemple.fr'`);
    const before = inbox.length;
    await drain();
    expect(inbox.slice(before).flatMap((m) => m.to)).toEqual(['a@exemple.fr']);
  });

  it('marque « incertain » sans renvoyer un message interrompu', async () => {
    const c = await one<any>(`SELECT id FROM campaigns WHERE name='Course'`);
    await query(`UPDATE campaign_recipients SET status='sending', updated_at = now() - interval '20 minutes' WHERE campaign_id=$1 AND email='a@exemple.fr'`, [c.id]);
    expect(await markUncertainRecipients()).toBe(1);
    expect((await one<any>(`SELECT status FROM campaign_recipients WHERE campaign_id=$1 AND email='a@exemple.fr'`, [c.id])).status).toBe('uncertain');
  });

  it('bloque les envois réels tant que l\'infrastructure n\'est pas vérifiée', async () => {
    expect(env.MAIL_SANDBOX).toBe(true);
    const r = await admin.req('POST', '/api/admin/settings/real-sending', { enabled: true });
    expect(r.status).toBe(412);
  });

  it('traite les plaintes reçues par webhook (exclusion immédiate) et refuse un secret invalide', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/webhooks/bounce', payload: { type: 'complaint', email: 'a@exemple.fr' }, headers: { 'x-webhook-secret': 'faux' } })).statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/webhooks/bounce', payload: { type: 'complaint', category: 'plainte', email: 'a@exemple.fr' }, headers: { 'x-webhook-secret': env.BOUNCE_WEBHOOK_SECRET } });
    expect(ok.statusCode).toBe(200);
    expect((await one<any>(`SELECT status FROM subscribers WHERE email='a@exemple.fr'`)).status).toBe('unsubscribed');
    expect(await one(`SELECT 1 FROM suppressions WHERE reason='complaint'`)).toBeTruthy();
  });

  it('le tableau de bord ne montre que des données réelles', async () => {
    const d = await admin.req('GET', '/api/admin/dashboard?period=7d');
    expect(d.status).toBe(200);
    expect(d.body.content.campaigns_sent).toBeGreaterThanOrEqual(2);
    expect(d.body.clicks.clicks).toBe(1);
    expect(d.body.growth.length).toBeGreaterThanOrEqual(7);
  });
});

describe('Rendu des e-mails et sécurité', () => {
  it('échappe le HTML saisi (XSS) et refuse les URL javascript:', () => {
    const t = createBlock('text'); t.props.text = '<script>alert(1)</script> [clic](javascript:alert(1))';
    const b = createBlock('button'); b.props.url = 'javascript:alert(1)';
    const r = renderEmail({ settings: { ...DEFAULT_SETTINGS, textColor: 'red;background:url(x)' }, blocks: [t, b] }, { subject: 's', unsubscribeUrl: 'https://x/u', privacyUrl: 'https://x/p', legalText: 'L' });
    expect(r.html).not.toContain('<script>');
    expect(r.html).not.toContain('javascript:');
    expect(r.html).not.toContain('background:url');
    expect(r.html).toContain('&lt;script&gt;');
  });

  it('ajoute toujours le pied de page légal et le lien de désinscription, plus une version texte', () => {
    const r = renderEmail({ settings: { ...DEFAULT_SETTINGS }, blocks: [createBlock('heading')] }, { subject: 's', unsubscribeUrl: 'https://n.sanctimaps.fr/desinscription?t=1', privacyUrl: 'https://x/p', legalText: 'SanctiMaps' });
    expect(r.html).toContain('Se désinscrire');
    expect(r.html).toContain('role="presentation"');
    expect(r.text).toContain('Se désinscrire : https://n.sanctimaps.fr/desinscription?t=1');
  });

  it('refuse un fichier déguisé en image', async () => {
    const boundary = '----img';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n<?php echo 1; ?>\r\n--${boundary}--\r\n`;
    const r = await app.inject({ method: 'POST', url: '/api/admin/media', payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie: admin.cookie, 'x-csrf-token': admin.csrf } });
    expect(r.statusCode).toBe(400);
  });

  it('accepte une vraie image, la ré-encode et la sert avec nosniff', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#8c2230' } }).png().toBuffer();
    const boundary = '----img2';
    const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bandeau.png"\r\nContent-Type: image/png\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const r = await app.inject({ method: 'POST', url: '/api/admin/media', payload: Buffer.concat([head, png, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie: admin.cookie, 'x-csrf-token': admin.csrf } });
    expect(r.statusCode).toBe(201);
    expect(r.json().width).toBe(1200);
    const file = await app.inject({ method: 'GET', url: `/media/${r.json().filename}` });
    expect(file.statusCode).toBe(200);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    await admin.req('DELETE', `/api/admin/media/${r.json().id}`, {});
  });
});
