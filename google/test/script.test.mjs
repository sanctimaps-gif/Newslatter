// Tests du fichier google/dist/Code.gs tel qu'il sera collé dans Google Apps Script.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { createGas } from './mock-gas.mjs';

const code = readFileSync(resolve(__dirname, '../dist/Code.gs'), 'utf8');
let gas, ctx, token, setupCode;

function call(path, method = 'GET', body = {}, tk = token) {
  const res = ctx.doPost({ postData: { contents: JSON.stringify({ path, method, body, token: tk, userAgent: 'vitest' }) }, parameter: {} });
  return JSON.parse(res.getContent());
}
const ok = (r) => { if (!r.ok) throw new Error(`${r.status} ${r.error}`); return r.data; };
const lastMail = (to) => [...gas.sent].reverse().find((m) => m.to === to);
const linkIn = (m, re) => decodeURIComponent((m.html.match(re) ?? [])[1] ?? '');
const design = { settings: { backgroundColor: '#f7f2e8', contentBackground: '#fffdf8', textColor: '#24201b', linkColor: '#8c2230', accentColor: '#8c2230', fontFamily: 'serif', width: 600 }, blocks: [
  { id: 'a', type: 'heading', props: { text: 'Lettre' } }, { id: 'b', type: 'text', props: { text: 'Bonjour {{prenom|ami}}, [la carte](https://sanctimaps.fr/)' } }, { id: 'c', type: 'footer', props: {} }] };

beforeAll(() => {
  gas = createGas();
  ctx = vm.createContext({ ...gas.globals });
  vm.runInContext(code, ctx);
  setupCode = ctx.installer();
});

describe('Installation et compte administrateur', () => {
  it('crée les onglets, les modèles, le déclencheur de 5 minutes et un code d\'installation', () => {
    expect([...gas.book.sheets.keys()]).toEqual(expect.arrayContaining(['Abonnes', 'Campagnes', 'Modeles', 'Comptes', 'Exclusions']));
    expect(gas.book.sheets.has('Feuille 1')).toBe(false);
    expect(gas.triggers.map((t) => [t.fn, t.m])).toEqual([['traiterFile', 5]]);
    expect(setupCode).toMatch(/^[A-F0-9]{10}$/);
    expect(ok(call('/api/public/config')).needsSetup).toBe(true);
  });
  it('refuse la création du premier compte sans le bon code, puis l\'accepte', () => {
    expect(call('/api/auth/setup', 'POST', { code: 'FAUX', email: 'admin@sanctimaps.fr', password: 'MotDePasse2026xx' }).status).toBe(403);
    const r = ok(call('/api/auth/setup', 'POST', { code: setupCode, email: 'admin@sanctimaps.fr', name: 'Admin', password: 'MotDePasse2026xx' }));
    token = r.token;
    expect(r.user.role).toBe('admin');
    expect(call('/api/auth/setup', 'POST', { code: setupCode, email: 'x@sanctimaps.fr', password: 'MotDePasse2026xx' }).status).toBe(403);
    const hash = gas.book.getSheetByName('Comptes').cells[1].join('|');
    expect(hash).toContain('pbkdf2$5000$');
    expect(hash).not.toContain('MotDePasse');
  });
  it('protège les routes privées et vérifie le mot de passe', () => {
    expect(call('/api/admin/subscribers', 'GET', {}, null).status).toBe(401);
    expect(call('/api/admin/subscribers', 'GET', {}, 'jeton-invente').status).toBe(401);
    expect(call('/api/auth/login', 'POST', { email: 'admin@sanctimaps.fr', password: 'mauvais' }, null).status).toBe(401);
    const r = ok(call('/api/auth/login', 'POST', { email: 'admin@sanctimaps.fr', password: 'MotDePasse2026xx' }, null));
    token = r.token;
    expect(ok(call('/api/auth/me')).user.email).toBe('admin@sanctimaps.fr');
  });
});

describe('Inscription double opt-in et désinscription', () => {
  it('le double opt-in peut être activé dans les paramètres', () => {
    expect(ok(call('/api/admin/settings')).settings.subscription.doubleOptIn).toBe(false);
    ok(call('/api/admin/settings/subscription', 'PUT', { doubleOptIn: true }));
  });
  it('enregistre en attente, envoie la confirmation depuis l\'adresse Gmail du site, confirme une seule fois', () => {
    expect(call('/api/public/subscribe', 'POST', { email: 'pas-valide', consent: true }, null).status).toBe(400);
    expect(call('/api/public/subscribe', 'POST', { email: 'a@b.fr', consent: false }, null).status).toBe(400);
    ok(call('/api/public/subscribe', 'POST', { email: 'robot@exemple.fr', consent: true, website: 'spam' }, null));
    ok(call('/api/public/subscribe', 'POST', { email: 'Marie@Exemple.fr', firstName: 'Marie', consent: true }, null));
    const subs = ok(call('/api/admin/subscribers'));
    expect(subs.rows.map((s) => [s.email, s.status])).toEqual([['marie@exemple.fr', 'pending']]);
    const mail = lastMail('marie@exemple.fr');
    expect(mail.from).toContain('compte.exemple@gmail.com');
    const t = linkIn(mail, /#\/confirmation\?t=([^"&]+)/);
    expect(ok(call('/api/public/confirm', 'POST', { token: t }, null)).firstName).toBe('Marie');
    expect(call('/api/public/confirm', 'POST', { token: t }, null).error).toMatch(/déjà été utilisé/);
    expect(ok(call('/api/admin/subscribers')).rows[0].status).toBe('confirmed');
  });
  it('ne réactive jamais automatiquement une adresse désinscrite', () => {
    const id = ok(call('/api/admin/subscribers')).rows[0].id;
    const unsub = linkIn(lastMail('marie@exemple.fr'), /#\/desinscription(?:\?t=([^"&]+))?/);
    void unsub;
    const tk = ctx.__snl ? null : null; void tk;
    // jeton signé fourni dans chaque campagne ; ici : jeton falsifié refusé
    expect(call('/api/public/unsubscribe', 'POST', { t: `${id.toString(36)}.faux` }, null).status).toBe(400);
  });
});

describe('Campagnes', () => {
  let campaignId;
  it('bloque l\'envoi réel tant que les vérifications ne sont pas faites', () => {
    const c = ok(call('/api/admin/campaigns', 'POST', { name: 'Test', subject: 'Le saint du jour', fromName: 'SanctiMaps', fromEmail: 'newsletter@sanctimaps.fr', design, audience: { type: 'all' } }));
    campaignId = c.id;
    expect(call(`/api/admin/campaigns/${c.id}/send`, 'POST', { mode: 'now', confirm: true }).status).toBe(412);
    expect(call('/api/admin/campaigns', 'POST', { name: 'X', subject: 'Y', fromEmail: 'moi@gmail.com', design }).status).toBe(400);
  });
  it('une adresse @sanctimaps.fr exige SPF/DKIM/DMARC, pas l\'adresse Gmail du site', () => {
    expect(ok(call('/api/admin/settings')).smtp.dnsRequired).toBe(false);
    expect(call('/api/admin/settings/sender', 'PUT', { fromName: 'SanctiMaps', fromEmail: 'quelquun@autre.fr', replyTo: '' }).status).toBe(400);
    ok(call('/api/admin/settings/sender', 'PUT', { fromName: 'SanctiMaps', fromEmail: 'newsletter@sanctimaps.fr', replyTo: '' }));
    expect(ok(call('/api/admin/settings')).smtp.dnsRequired).toBe(true);
  });
  it('vérifie réellement l\'alias Gmail et le DNS, envoie un test contrôlé, puis autorise les envois', () => {
    expect(ok(call('/api/admin/settings/smtp/verify', 'POST')).ok).toBe(true);
    ok(call('/api/admin/settings/dkimSelector', 'PUT', 's1-ionos'));
    const d = ok(call('/api/admin/settings/domain/check', 'POST'));
    expect([d.spf, d.dkim, d.dmarc]).toEqual([true, true, true]);
    expect(call(`/api/admin/campaigns/${campaignId}/test`, 'POST', { to: 'inconnu@exemple.fr' }).status).toBe(400);
    expect(ok(call(`/api/admin/campaigns/${campaignId}/test`, 'POST', { to: 'admin@sanctimaps.fr' })).status).toBe('accepted');
    // Interrupteur pause : bloque immédiatement, puis débloque
    ok(call('/api/admin/settings/real-sending', 'POST', { enabled: false }));
    expect(call(`/api/admin/campaigns/${campaignId}/send`, 'POST', { mode: 'now', confirm: true }).error).toMatch(/pause/);
    expect(ok(call('/api/admin/settings/real-sending', 'POST', { enabled: true })).enabled).toBe(true);
    expect(ok(call('/api/admin/settings')).settings.realSendingEnabled).toBe(true);
  });
  it('envoie par le déclencheur : confirmés seulement, personnalisé, List-Unsubscribe, rebond traité, jamais deux fois', () => {
    gas.book.getSheetByName('Abonnes');
    ok(call('/api/admin/subscribers', 'POST', { email: 'attente@exemple.fr', sendConfirmation: false }));
    // abonnés confirmés supplémentaires (dont une adresse qui sera refusée)
    for (const e of ['paul@exemple.fr', 'rebond@exemple.fr']) {
      ok(call('/api/public/subscribe', 'POST', { email: e, consent: true }, null));
      ok(call('/api/public/confirm', 'POST', { token: linkIn(lastMail(e), /#\/confirmation\?t=([^"&]+)/) }, null));
    }
    expect(ok(call('/api/admin/audience/count', 'POST', { audience: { type: 'all' } })).count).toBe(3);
    expect(ok(call('/api/admin/settings')).settings.tracking.clicks).toBe(false); // liens directs par défaut
    ok(call('/api/admin/settings/tracking', 'PUT', { clicks: true, opens: false }));
    ok(call(`/api/admin/campaigns/${campaignId}/send`, 'POST', { mode: 'now', confirm: true }));
    gas.setReject(/rebond/);
    const before = gas.sent.length;
    ctx.traiterFile();
    const batch = gas.sent.slice(before);
    expect(batch.map((m) => m.to).sort()).toEqual(['marie@exemple.fr', 'paul@exemple.fr']);
    const marie = batch.find((m) => m.to === 'marie@exemple.fr');
    expect(marie.text).toContain('Bonjour Marie,');
    expect(marie.headers['list-unsubscribe']).toMatch(/^<https:\/\/script\.google\.com\/macros\/s\/TEST\/exec\?action=unsubscribe&t=[^>]+>, <mailto:compte\.exemple@gmail\.com\?subject=desinscription%20[^>]+>$/);
    expect(marie.html).not.toContain('&#847;');
    expect(marie.headers['list-unsubscribe-post']).toBe('List-Unsubscribe=One-Click');
    expect(marie.html).toMatch(/#\/r\?k=[^"&]+&amp;l=\d+/);
    const detail = ok(call(`/api/admin/campaigns/${campaignId}`));
    expect(detail.campaign.status).toBe('sent');
    expect([detail.stats.accepted, detail.stats.bounced]).toEqual([2, 1]);
    expect(ok(call('/api/admin/subscribers?status=bounced')).rows.map((s) => s.email)).toEqual(['rebond@exemple.fr']);
    ctx.traiterFile();
    expect(gas.sent.length).toBe(before + 2);
  });
  it('mesure un vrai clic et refuse un jeton falsifié', () => {
    const marie = [...gas.sent].reverse().find((m) => m.to === 'marie@exemple.fr' && m.subject === 'Le saint du jour');
    const [, k, l] = marie.html.match(/#\/r\?k=([^"&]+)&amp;l=(\d+)/);
    expect(ok(call('/api/public/click', 'POST', { k: decodeURIComponent(k), l: Number(l) }, null)).url).toBe('https://sanctimaps.fr/');
    ok(call('/api/public/click', 'POST', { k: '1.faux', l: Number(l) }, null));
    expect(ok(call(`/api/admin/campaigns/${campaignId}`)).stats.clicks).toBe(1);
  });
  it('désinscription en un clic depuis la messagerie (POST sur l\'URL List-Unsubscribe)', () => {
    const marie = [...gas.sent].reverse().find((m) => m.to === 'marie@exemple.fr' && m.subject === 'Le saint du jour');
    const url = new URL(marie.headers['list-unsubscribe'].match(/^<([^>]+)>/)[1]);
    const res = ctx.doPost({ parameter: { action: 'unsubscribe', t: url.searchParams.get('t') }, postData: { contents: 'List-Unsubscribe=One-Click' } });
    expect(res.getContent()).toBe('OK');
    expect(ok(call('/api/admin/subscribers?status=unsubscribed')).rows.map((s) => s.email)).toContain('marie@exemple.fr');
    // une nouvelle inscription ne la réactive pas sans confirmation
    for (const k of [...gas.cache.keys()]) if (k.startsWith('subs_')) gas.cache.delete(k);
    const sheet = gas.book.getSheetByName('Jetons'); sheet.cells.slice(1).forEach((r) => { if (r) r[5] = '"2020-01-01T00:00:00.000Z"'; });
    ok(call('/api/public/subscribe', 'POST', { email: 'marie@exemple.fr', consent: true }, null));
    expect(ok(call('/api/admin/subscribers?status=unsubscribed')).rows.map((s) => s.email)).toContain('marie@exemple.fr');
  });
  it('programme sans envoyer avant l\'heure, puis envoie à l\'échéance', () => {
    const c = ok(call('/api/admin/campaigns', 'POST', { name: 'Prog', subject: 'Programmée', fromName: 'SanctiMaps', fromEmail: 'newsletter@sanctimaps.fr', design, audience: { type: 'all' } }));
    ok(call(`/api/admin/campaigns/${c.id}/send`, 'POST', { mode: 'schedule', scheduledAt: new Date(Date.now() + 3600e3).toISOString(), confirm: true }));
    const before = gas.sent.length;
    ctx.traiterFile();
    expect(gas.sent.length).toBe(before);
    const sh = gas.book.getSheetByName('Campagnes');
    const cols = sh.cells[0]; const row = sh.cells.findIndex((r) => r?.[0] === String(c.id));
    sh.cells[row][cols.indexOf('scheduled_at')] = JSON.stringify(new Date(Date.now() - 1000).toISOString());
    ctx.traiterFile();
    expect(gas.sent.slice(before).map((m) => m.to)).toEqual(['paul@exemple.fr']);
  });
  it('respecte le quota quotidien de Gmail et reprend plus tard', () => {
    ok(call('/api/public/subscribe', 'POST', { email: 'jean@exemple.fr', consent: true }, null));
    ok(call('/api/public/confirm', 'POST', { token: linkIn(lastMail('jean@exemple.fr'), /#\/confirmation\?t=([^"&]+)/) }, null));
    const c = ok(call('/api/admin/campaigns', 'POST', { name: 'Quota', subject: 'Quota', fromName: 'SanctiMaps', fromEmail: 'newsletter@sanctimaps.fr', design, audience: { type: 'all' } }));
    ok(call(`/api/admin/campaigns/${c.id}/send`, 'POST', { mode: 'now', confirm: true }));
    gas.setQuota(0);
    const before = gas.sent.length;
    ctx.traiterFile();
    expect(gas.sent.length).toBe(before);
    expect(ok(call(`/api/admin/campaigns/${c.id}`)).campaign.status).toBe('sending');
    gas.setQuota(50);
    ctx.traiterFile();
    expect(ok(call(`/api/admin/campaigns/${c.id}`)).campaign.status).toBe('sent');
  });
  it('traite les avis de non-distribution reçus dans Gmail', () => {
    let labeled = false;
    gas.inbox.push({ get labeled() { return labeled; }, addLabel() { labeled = true; }, getMessages: () => [{ getPlainBody: () => 'Delivery failed: 550 5.1.1 user unknown', getHeader: (h) => (h === 'X-Failed-Recipients' ? 'jean@exemple.fr' : '') }] });
    ctx.traiterFile();
    expect(ok(call('/api/admin/subscribers?status=bounced')).rows.map((s) => s.email)).toContain('jean@exemple.fr');
    expect(labeled).toBe(true);
  });
});

describe('Sécurité et données', () => {
  it('stocke le texte sans jamais créer de formule dans le tableur', () => {
    ok(call('/api/admin/subscribers', 'POST', { email: 'formule@exemple.fr', firstName: '=IMPORTXML("http://x")', sendConfirmation: false }));
    const s = ok(call('/api/admin/subscribers?q=formule')).rows[0];
    expect(s.first_name).toBe('=IMPORTXML("http://x")');
  });
  it('import CSV : détection et jamais de confirmation automatique', () => {
    const csv = 'Prénom;Adresse e-mail\nAnne;anne@exemple.fr\nX;pas-valide\nA2;anne@exemple.fr\nP;paul@exemple.fr\n';
    const prev = ok(call('/api/admin/subscribers/import/preview', 'POST', { file: { name: 'c.csv', data: Buffer.from(csv).toString('base64') } }));
    expect(prev.rows.map((r) => r.status)).toEqual(['ok', 'invalid', 'duplicate_file', 'exists']);
    const r = ok(call('/api/admin/subscribers/import/commit', 'POST', { rows: [{ email: 'anne@exemple.fr' }], sourceLabel: 'test', consentNote: 'Inscrits au salon 2026', sendConfirmation: false }));
    expect(r.imported).toBe(1);
    expect(ok(call('/api/admin/subscribers?q=anne')).rows[0].status).toBe('pending');
  });
  it('anonymise et empêche la réimportation', () => {
    const s = ok(call('/api/admin/subscribers?q=anne')).rows[0];
    ok(call(`/api/admin/subscribers/${s.id}`, 'DELETE'));
    expect(call('/api/admin/subscribers', 'POST', { email: 'anne@exemple.fr' }).status).toBe(409);
  });
  it('n\'accepte qu\'une vraie image', () => {
    expect(call('/api/admin/media', 'POST', { file: { name: 'x.png', data: Buffer.from('<?php ?>').toString('base64') } }).status).toBe(400);
    const png = Buffer.from('89504E470D0A1A0A0000000D49484452', 'hex');
    expect(ok(call('/api/admin/media', 'POST', { file: { name: 'x.png', data: png.toString('base64') }, alt: 'Logo' })).url).toMatch(/^https:\/\/lh3\.googleusercontent\.com\/d\//);
  });
  it('tableau de bord calculé sur les vraies données', () => {
    const d = ok(call('/api/admin/dashboard?period=7d'));
    expect(d.content.campaigns_sent).toBeGreaterThanOrEqual(3);
    expect(d.clicks.clicks).toBe(1);
    expect(d.growth.length).toBeGreaterThanOrEqual(7);
  });
});

describe('Sans adresse @sanctimaps.fr : envoi depuis l\'adresse Gmail du site', () => {
  it('fonctionne sans alias ni réglage DNS', () => {
    const g2 = createGas({ aliases: [] });
    const c2 = vm.createContext({ ...g2.globals });
    vm.runInContext(code, c2);
    const code2 = c2.installer();
    const call2 = (path, method = 'GET', body = {}, tk) => JSON.parse(c2.doPost({ postData: { contents: JSON.stringify({ path, method, body, token: tk }) }, parameter: {} }).getContent());
    const t = call2('/api/auth/setup', 'POST', { code: code2, email: 'admin@sanctimaps.fr', password: 'MotDePasse2026xx' }).data.token;
    const st = call2('/api/admin/settings', 'GET', {}, t).data;
    expect(st.settings.sender.fromEmail).toBe('compte.exemple@gmail.com');
    expect(st.smtp.fromAllowed).toBe(true);
    expect(call2('/api/admin/settings/smtp/verify', 'POST', {}, t).data.ok).toBe(true);
    // Inscription directe (réglage par défaut) : abonné immédiatement, aucun e-mail de confirmation
    const sub = call2('/api/public/subscribe', 'POST', { email: 'lecteur@exemple.fr', firstName: 'Luc', consent: true });
    expect(sub.data.confirmed).toBe(true);
    expect(g2.sent.some((m) => m.to === 'lecteur@exemple.fr')).toBe(false);
    expect(call2('/api/admin/subscribers', 'GET', {}, t).data.rows.map((x) => [x.email, x.status])).toEqual([['lecteur@exemple.fr', 'confirmed']]);
    expect(call2('/api/public/subscribe', 'POST', { email: 'refus@exemple.fr', consent: false }).status).toBe(400);
    const manual = call2('/api/admin/subscribers', 'POST', { email: 'ajout@exemple.fr', consentNote: 'Demande orale' }, t).data;
    expect(manual.status).toBe('confirmed');
    const camp = call2('/api/admin/campaigns', 'POST', { name: 'G', subject: 'Lettre', fromName: 'SanctiMaps', fromEmail: 'compte.exemple@gmail.com', design }, t).data;
    expect(call2(`/api/admin/campaigns/${camp.id}/test`, 'POST', { to: 'compte.exemple@gmail.com' }, t).data.status).toBe('accepted');
    // Aucune étape préalable : l'envoi depuis l'adresse Gmail du site est autorisé d'office
    expect(st.settings.realSendingEnabled).toBe(true);
    const bad = call2('/api/admin/campaigns', 'POST', { name: 'B', subject: 'B', fromName: 'S', fromEmail: 'newsletter@sanctimaps.fr', design }, t).data;
    expect(call2(`/api/admin/campaigns/${bad.id}/send`, 'POST', { mode: 'now', confirm: true }, t).error).toMatch(/compte\.exemple@gmail\.com/);
    call2(`/api/admin/campaigns/${camp.id}/send`, 'POST', { mode: 'now', confirm: true }, t);
    c2.traiterFile();
    const letter = g2.sent.find((m) => m.to === 'lecteur@exemple.fr' && m.subject === 'Lettre');
    expect(letter.from).toContain('compte.exemple@gmail.com');
    expect(letter.headers['list-unsubscribe-post']).toBe('List-Unsubscribe=One-Click');
  });
});

describe('Délivrabilité', () => {
  it('liens directs par défaut et désinscription demandée par e-mail traitée automatiquement', () => {
    const g3 = createGas({ aliases: [] });
    const c3 = vm.createContext({ ...g3.globals });
    vm.runInContext(code, c3);
    const code3 = c3.installer();
    const call3 = (path, method = 'GET', body = {}, tk) => JSON.parse(c3.doPost({ postData: { contents: JSON.stringify({ path, method, body, token: tk }) }, parameter: {} }).getContent());
    const t = call3('/api/auth/setup', 'POST', { code: code3, email: 'admin@sanctimaps.fr', password: 'MotDePasse2026xx' }).data.token;
    call3('/api/public/subscribe', 'POST', { email: 'lea@exemple.fr', consent: true });
    const camp = call3('/api/admin/campaigns', 'POST', { name: 'D', subject: 'Lettre', fromName: 'SanctiMaps', fromEmail: 'compte.exemple@gmail.com', design }, t).data;
    call3(`/api/admin/campaigns/${camp.id}/send`, 'POST', { mode: 'now', confirm: true }, t);
    c3.traiterFile();
    const letter = g3.sent.find((m) => m.to === 'lea@exemple.fr');
    expect(letter.html).toContain('href="https://sanctimaps.fr/"');
    expect(letter.html).not.toContain('#/r?k=');
    const subject = decodeURIComponent(letter.headers['list-unsubscribe'].match(/subject=([^>]+)>/)[1]);
    let labeled = false;
    g3.inbox.push({ kind: 'unsub', get labeled() { return labeled; }, addLabel() { labeled = true; }, getMessages: () => [{ getSubject: () => subject }] });
    g3.inbox.push({ kind: 'unsub', labeled: false, addLabel() { this.labeled = true; }, getMessages: () => [{ getSubject: () => 'desinscription 1.falsifie00' }] });
    c3.traiterFile();
    expect(call3('/api/admin/subscribers?status=unsubscribed', 'GET', {}, t).data.rows.map((x) => x.email)).toEqual(['lea@exemple.fr']);
  });
});
