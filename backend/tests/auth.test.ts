import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '../src/lib/db.ts';
import { totpCode } from '../src/lib/crypto.ts';
import { Client, closeAll, createUser, makeApp, resetDb, startSmtp } from './helpers.ts';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
beforeAll(async () => { await startSmtp(); await resetDb(); app = await makeApp(); await createUser('admin@sanctimaps.fr', 'admin'); await createUser('editeur@sanctimaps.fr', 'editor'); await createUser('lecteur@sanctimaps.fr', 'viewer'); });
afterAll(() => closeAll(app));

describe('Authentification', () => {
  it('refuse un mauvais mot de passe avec un message générique', async () => {
    const c = new Client(app);
    const r = await c.login('admin@sanctimaps.fr', 'mauvais');
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('Identifiants incorrects.');
    const u = await c.login('inconnu@sanctimaps.fr', 'mauvais');
    expect(u.body.error).toBe('Identifiants incorrects.');
  });

  it('connecte l\'administrateur et pose un cookie httpOnly SameSite=Strict', async () => {
    const c = new Client(app);
    const r = await c.login('admin@sanctimaps.fr');
    expect(r.status).toBe(200);
    expect(String(r.headers['set-cookie'])).toMatch(/HttpOnly/i);
    expect(String(r.headers['set-cookie'])).toMatch(/SameSite=Strict/i);
    const me = await c.req('GET', '/api/auth/me');
    expect(me.body.user.role).toBe('admin');
  });

  it('protège toutes les routes privées sans session', async () => {
    const c = new Client(app);
    for (const url of ['/api/admin/dashboard', '/api/admin/subscribers', '/api/admin/campaigns', '/api/admin/settings', '/api/admin/templates', '/api/admin/media', '/api/admin/automations', '/api/admin/logs/audit']) {
      expect((await c.req('GET', url)).status, url).toBe(401);
    }
  });

  it('exige le jeton CSRF pour toute écriture', async () => {
    const c = new Client(app);
    await c.login('admin@sanctimaps.fr');
    const csrf = c.csrf; c.csrf = '';
    expect((await c.req('POST', '/api/admin/newsletters', { title: 'x', design: { settings: {}, blocks: [] } })).status).toBe(403);
    c.csrf = 'faux'; expect((await c.req('POST', '/api/admin/segments', { name: 'x', rules: {} })).status).toBe(403);
    c.csrf = csrf; expect((await c.req('POST', '/api/admin/segments', { name: 'Tous', rules: {} })).status).toBe(201);
  });

  it('applique les rôles : lecteur en lecture seule, éditeur sans paramètres', async () => {
    const viewer = new Client(app); await viewer.login('lecteur@sanctimaps.fr');
    expect((await viewer.req('GET', '/api/admin/subscribers')).status).toBe(200);
    expect((await viewer.req('POST', '/api/admin/segments', { name: 'x', rules: {} })).status).toBe(403);
    const editor = new Client(app); await editor.login('editeur@sanctimaps.fr');
    expect((await editor.req('POST', '/api/admin/segments', { name: 'y', rules: {} })).status).toBe(201);
    expect((await editor.req('PUT', '/api/admin/settings/sending', { batchSize: 10, batchDelayMs: 0, maxPerHour: 100, maxAttempts: 3 })).status).toBe(403);
    expect((await editor.req('DELETE', '/api/admin/subscribers/1')).status).toBe(403);
    expect((await editor.req('GET', '/api/admin/logs/audit')).status).toBe(403);
  });

  it('verrouille le compte après 5 échecs', async () => {
    await createUser('cible@sanctimaps.fr', 'editor');
    for (let i = 0; i < 5; i++) await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'cible@sanctimaps.fr', password: 'faux' }, remoteAddress: `10.0.0.${i + 10}` });
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'cible@sanctimaps.fr', password: 'MotDePasseSolide2026' }, remoteAddress: '10.0.1.1' });
    expect(r.statusCode).toBe(429);
  });

  it('déconnecte et invalide la session', async () => {
    const c = new Client(app); await c.login('admin@sanctimaps.fr');
    const cookie = c.cookie;
    await c.req('POST', '/api/auth/logout', {});
    c.cookie = cookie;
    expect((await c.req('GET', '/api/admin/dashboard')).status).toBe(401);
  });

  it('active puis exige la double authentification (TOTP)', async () => {
    await createUser('deuxfa@sanctimaps.fr', 'admin');
    const c = new Client(app); await c.login('deuxfa@sanctimaps.fr');
    const setup = await c.req('POST', '/api/auth/2fa/setup', {});
    expect(setup.body.secret).toMatch(/^[A-Z2-7]+$/);
    expect((await c.req('POST', '/api/auth/2fa/enable', { code: '000000' })).status).toBe(400);
    expect((await c.req('POST', '/api/auth/2fa/enable', { code: totpCode(setup.body.secret) })).status).toBe(200);
    const c2 = new Client(app);
    const l = await c2.login('deuxfa@sanctimaps.fr');
    expect(l.body.twoFactorRequired).toBe(true);
    expect((await c2.req('GET', '/api/admin/dashboard')).status).toBe(401); // session à moitié ouverte = refusée
    expect((await c2.req('POST', '/api/auth/2fa', { code: '123456' })).status).toBe(401);
    const ok = await c2.req('POST', '/api/auth/2fa', { code: totpCode(setup.body.secret) });
    expect(ok.status).toBe(200);
    c2.csrf = ok.body.csrfToken;
    expect((await c2.req('GET', '/api/admin/dashboard')).status).toBe(200);
  });

  it('ne stocke aucun mot de passe en clair', async () => {
    const rows = await query<{ password_hash: string }>('SELECT password_hash FROM users');
    for (const r of rows) { expect(r.password_hash).toMatch(/^scrypt\$/); expect(r.password_hash).not.toContain('MotDePasse'); }
  });

  it('réinitialise le mot de passe par lien à usage unique', async () => {
    const c = new Client(app);
    const r = await c.req('POST', '/api/auth/password-reset/request', { email: 'admin@sanctimaps.fr' });
    expect(r.status).toBe(200);
    const job = await query<any>(`SELECT payload FROM scheduled_jobs WHERE job_type='email.password_reset' ORDER BY id DESC LIMIT 1`);
    const token = new URL(job[0].payload.url).searchParams.get('t')!;
    expect((await c.req('POST', '/api/auth/password-reset/confirm', { token, password: 'court' })).status).toBe(400);
    expect((await c.req('POST', '/api/auth/password-reset/confirm', { token, password: 'NouveauMotDePasse2027' })).status).toBe(200);
    expect((await c.req('POST', '/api/auth/password-reset/confirm', { token, password: 'EncoreUnAutre2028x' })).status).toBe(400);
    expect((await c.login('admin@sanctimaps.fr', 'NouveauMotDePasse2027')).status).toBe(200);
  });
});
