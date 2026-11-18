import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { one, query } from '../src/lib/db.ts';
import { unsubscribeToken } from '../src/lib/crypto.ts';
import { drain } from '../../worker/src/index.ts';
import { Client, closeAll, createUser, inbox, makeApp, resetDb, startSmtp } from './helpers.ts';
import { env } from '../src/config/env.ts';

let app: FastifyInstance;
let admin: Client;
const tokenFromMail = (to: string) => {
  const m = [...inbox].reverse().find((x) => x.to.includes(to) && /Confirmez/.test(x.subject));
  return m ? new URL(m.text.match(/https?:\/\/\S+confirmation\?t=\S+/)![0]).searchParams.get('t')! : null;
};
const subscribe = (email: string, extra: object = {}, headers: Record<string, string> = {}, ip = '127.0.0.1') =>
  app.inject({ method: 'POST', url: '/api/public/subscribe', payload: { email, consent: true, firstName: 'Jean', ...extra }, headers, remoteAddress: ip });

beforeAll(async () => {
  await startSmtp(); await resetDb(); app = await makeApp();
  await createUser('admin@sanctimaps.fr', 'admin');
  admin = new Client(app); await admin.login('admin@sanctimaps.fr');
});
afterAll(() => closeAll(app));

describe('Inscription publique et double opt-in', () => {
  it('valide les entrées côté serveur', async () => {
    expect((await subscribe('pas-une-adresse', {}, {}, '1.1.1.1')).statusCode).toBe(400);
    const noConsent = await app.inject({ method: 'POST', url: '/api/public/subscribe', payload: { email: 'a@b.fr', consent: false }, remoteAddress: '1.1.1.2' });
    expect(noConsent.statusCode).toBe(400);
  });

  it('ignore silencieusement les robots (champ piège)', async () => {
    const r = await subscribe('robot@exemple.fr', { website: 'http://spam' }, {}, '1.1.1.3');
    expect(r.statusCode).toBe(200);
    expect(await one(`SELECT 1 FROM subscribers WHERE email='robot@exemple.fr'`)).toBeNull();
  });

  it('refuse le site principal sans clé publique, l\'accepte avec', async () => {
    expect((await subscribe('ext@exemple.fr', {}, { origin: 'https://sanctimaps.fr' }, '1.1.1.4')).statusCode).toBe(403);
    const ok = await subscribe('ext@exemple.fr', { siteKey: env.PUBLIC_SITE_KEY }, { origin: 'https://sanctimaps.fr' }, '1.1.1.5');
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['access-control-allow-origin']).toBe('https://sanctimaps.fr');
    expect((await one<any>(`SELECT source FROM subscribers WHERE email='ext@exemple.fr'`)).source).toBe('site-principal');
  });

  it('enregistre en attente, envoie la confirmation, confirme une seule fois', async () => {
    const r = await subscribe('marie@exemple.fr', {}, {}, '2.2.2.2');
    expect(r.json().ok).toBe(true);
    const s = await one<any>(`SELECT * FROM subscribers WHERE email='marie@exemple.fr'`);
    expect(s.status).toBe('pending');
    await drain();
    const token = tokenFromMail('marie@exemple.fr');
    expect(token).toBeTruthy();
    const tokRow = await one<any>('SELECT token_hash FROM confirmation_tokens WHERE subscriber_id=$1', [s.id]);
    expect(tokRow.token_hash).not.toBe(token); // stocké haché
    const c = await app.inject({ method: 'POST', url: '/api/public/confirm', payload: { token } });
    expect(c.statusCode).toBe(200);
    const after = await one<any>(`SELECT * FROM subscribers WHERE email='marie@exemple.fr'`);
    expect(after.status).toBe('confirmed');
    expect(after.confirmed_at).toBeTruthy();
    const proofs = await query<any>('SELECT action, ip_truncated, consent_text FROM consent_records WHERE subscriber_id=$1 ORDER BY id', [s.id]);
    expect(proofs.map((p) => p.action)).toEqual(['request', 'confirm']);
    expect(proofs[0].ip_truncated).toBe('2.2.2.0');
    expect(proofs[1].consent_text).toMatch(/J'accepte/);
    const again = await app.inject({ method: 'POST', url: '/api/public/confirm', payload: { token } });
    expect(again.json().reason).toBe('used');
  });

  it('refuse un jeton expiré ou inventé', async () => {
    await subscribe('expire@exemple.fr', {}, {}, '2.2.2.3');
    await drain();
    const token = tokenFromMail('expire@exemple.fr')!;
    await query(`UPDATE confirmation_tokens SET expires_at = now() - interval '1 minute'`);
    expect((await app.inject({ method: 'POST', url: '/api/public/confirm', payload: { token } })).json().reason).toBe('expired');
    expect((await app.inject({ method: 'POST', url: '/api/public/confirm', payload: { token: 'invente' } })).json().reason).toBe('invalid');
  });

  it('ne révèle pas si une adresse est déjà abonnée', async () => {
    const r = await subscribe('marie@exemple.fr', {}, {}, '2.2.2.4');
    expect(r.json().message).toMatch(/Si cette adresse est valide/);
  });

  it('limite les inscriptions répétées depuis une même IP', async () => {
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await subscribe(`flood${i}@exemple.fr`, {}, {}, '9.9.9.9')).statusCode);
    expect(codes).toContain(429);
  });
});

describe('Désinscription', () => {
  it('désinscrit avec un jeton signé, sans connexion, et exclut immédiatement', async () => {
    const s = await one<any>(`SELECT id FROM subscribers WHERE email='marie@exemple.fr'`);
    expect((await app.inject({ method: 'GET', url: '/api/public/unsubscribe?t=abc.def' })).statusCode).toBe(400);
    const t = unsubscribeToken(s.id);
    const info = await app.inject({ method: 'GET', url: `/api/public/unsubscribe?t=${encodeURIComponent(t)}` });
    expect(info.json().email).toMatch(/^ma•+@exemple\.fr$/);
    const r = await app.inject({ method: 'POST', url: '/api/public/unsubscribe', payload: { t } });
    expect(r.statusCode).toBe(200);
    const after = await one<any>('SELECT status, unsubscribed_at FROM subscribers WHERE id=$1', [s.id]);
    expect(after.status).toBe('unsubscribed');
    expect(after.unsubscribed_at).toBeTruthy();
    expect(await one(`SELECT 1 FROM suppressions WHERE reason='unsubscribe'`)).toBeTruthy();
  });

  it('accepte la désinscription en un clic (RFC 8058)', async () => {
    await subscribe('oneclick@exemple.fr', {}, {}, '3.3.3.3'); await drain();
    await app.inject({ method: 'POST', url: '/api/public/confirm', payload: { token: tokenFromMail('oneclick@exemple.fr') } });
    const s = await one<any>(`SELECT id FROM subscribers WHERE email='oneclick@exemple.fr'`);
    const r = await app.inject({ method: 'POST', url: `/api/public/unsubscribe/one-click?t=${encodeURIComponent(unsubscribeToken(s.id))}`, payload: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(r.statusCode).toBe(200);
    expect((await one<any>('SELECT status FROM subscribers WHERE id=$1', [s.id])).status).toBe('unsubscribed');
  });

  it('ne réactive jamais automatiquement : une nouvelle inscription exige une nouvelle confirmation', async () => {
    inbox.length = 0;
    await query(`UPDATE confirmation_tokens SET created_at = now() - interval '5 minutes'`); // au-delà de l'anti-abus de 2 min
    await subscribe('marie@exemple.fr', {}, {}, '4.4.4.4');
    expect((await one<any>(`SELECT status FROM subscribers WHERE email='marie@exemple.fr'`)).status).toBe('unsubscribed');
    await drain();
    const token = tokenFromMail('marie@exemple.fr');
    expect(token).toBeTruthy();
    await app.inject({ method: 'POST', url: '/api/public/confirm', payload: { token } });
    expect((await one<any>(`SELECT status FROM subscribers WHERE email='marie@exemple.fr'`)).status).toBe('confirmed');
  });
});

describe('Gestion des contacts', () => {
  it('ajout manuel : reste en attente et refuse les adresses exclues', async () => {
    const r = await admin.req('POST', '/api/admin/subscribers', { email: 'Nouveau@Exemple.fr', firstName: 'Paul', sendConfirmation: false });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('pending');
    expect(r.body.email).toBe('nouveau@exemple.fr');
    const blocked = await admin.req('POST', '/api/admin/subscribers', { email: 'oneclick@exemple.fr' });
    expect(blocked.status).toBe(409);
  });

  it('ne permet pas de forcer le statut « confirmé »', async () => {
    const s = await one<any>(`SELECT id FROM subscribers WHERE email='nouveau@exemple.fr'`);
    const r = await admin.req('PATCH', `/api/admin/subscribers/${s.id}`, { status: 'confirmed' });
    expect(r.status).toBe(400);
  });

  it('recherche, filtre, trie et pagine (et résiste aux injections SQL)', async () => {
    const r = await admin.req('GET', '/api/admin/subscribers?q=exemple&status=confirmed&sort=email_asc&pageSize=5');
    expect(r.status).toBe(200);
    expect(r.body.rows.every((x: any) => x.status === 'confirmed')).toBe(true);
    const inj = await admin.req('GET', `/api/admin/subscribers?q=${encodeURIComponent("' OR 1=1; DROP TABLE subscribers; --")}`);
    expect(inj.status).toBe(200);
    expect(inj.body.total).toBe(0);
    expect((await admin.req('GET', '/api/admin/subscribers?sort=id;DROP')).status).toBe(400);
  });

  it('exporte les données personnelles et anonymise sur demande', async () => {
    const s = await one<any>(`SELECT id FROM subscribers WHERE email='marie@exemple.fr'`);
    const exp = await admin.req('GET', `/api/admin/subscribers/${s.id}/export`);
    expect(exp.body.subscriber.email).toBe('marie@exemple.fr');
    expect(exp.body.consent_records.length).toBeGreaterThan(1);
    expect((await admin.req('DELETE', `/api/admin/subscribers/${s.id}`)).status).toBe(200);
    const after = await one<any>('SELECT * FROM subscribers WHERE id=$1', [s.id]);
    expect(after.email).toMatch(/@anonymise\.invalid$/);
    expect(after.first_name).toBeNull();
    // L'adresse ne peut plus être réimportée par erreur
    expect((await admin.req('POST', '/api/admin/subscribers', { email: 'marie@exemple.fr' })).status).toBe(409);
  });

  it('exporte en CSV en neutralisant les formules', async () => {
    await query(`INSERT INTO subscribers(email, first_name, status, source, confirmed_at) VALUES ('formule@exemple.fr', '=HYPERLINK("x")', 'confirmed', 'test', now())`);
    const r = await admin.req('GET', '/api/admin/subscribers-export.csv?status=confirmed');
    expect(r.status).toBe(200);
    expect(r.body).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('Import CSV', () => {
  const csv = 'Prénom;Adresse e-mail;Nom\nAnne;anne@exemple.fr;Martin\nBob;pas-valide;X\nAnne2;anne@exemple.fr;Y\nOne;oneclick@exemple.fr;Z\nNouveau;nouveau@exemple.fr;N\n';
  const upload = (content: string, filename = 'contacts.csv') => {
    const boundary = '----test';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--\r\n`;
    return app.inject({ method: 'POST', url: '/api/admin/subscribers/import/preview', payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie: admin.cookie, 'x-csrf-token': admin.csrf } });
  };

  it('détecte colonnes, adresses invalides, doublons, existants et exclusions', async () => {
    const r = (await upload(csv)).json();
    expect(r.delimiter).toBe(';');
    expect(r.mapping).toEqual({ email: 1, first_name: 0, last_name: 2 });
    expect(r.rows.map((x: any) => x.status)).toEqual(['ok', 'invalid', 'duplicate_file', 'suppressed', 'exists']);
  });

  it('refuse un fichier qui n\'est pas un CSV', async () => {
    expect((await upload('x', 'virus.exe')).statusCode).toBe(400);
  });

  it('importe uniquement en « en attente », jamais en « confirmé »', async () => {
    const r = await admin.req('POST', '/api/admin/subscribers/import/commit', { rows: [{ email: 'anne@exemple.fr', firstName: 'Anne' }, { email: 'oneclick@exemple.fr' }], sourceLabel: 'ancien tableur', consentNote: 'Inscrits via le formulaire Google de sanctimaps.fr/lettre', sendConfirmation: true });
    expect(r.body).toEqual({ imported: 1, skipped: 1 });
    const s = await one<any>(`SELECT status, source FROM subscribers WHERE email='anne@exemple.fr'`);
    expect(s.status).toBe('pending');
    expect(s.source).toBe('import:ancien tableur');
  });
});
