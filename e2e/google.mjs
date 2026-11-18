// Parcours complet dans un navigateur : site GitHub Pages + script Google (simulé localement par e2e/google-shim.mjs).
// Usage : node e2e/google-shim.mjs & node e2e/google.mjs [dossier-captures]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const HOST = 'http://127.0.0.1:8092';
const BASE = `${HOST}/Newslatter/`;
const OUT = process.argv[2] ?? 'test-results/google';
mkdirSync(OUT, { recursive: true });
const errors = [];
const ok = (m) => console.log(`✔ ${m}`);
const j = async (p) => (await fetch(`${HOST}${p}`)).json();
const mailTo = async (to, re) => (await j('/__test/mails')).reverse().find((m) => m.to === to && re.test(m.subject));
const linkIn = (m, re) => decodeURIComponent(m.html.match(re)[1]).replace(/&amp;/g, '&');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'fr-FR' });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(e.message));
// Le logo est chargé depuis https://sanctimaps.fr : bloqué dans cet environnement de test, pas sur Internet.
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_CONNECTION|ERR_NAME/.test(m.text())) errors.push(m.text()); });
const shot = (n, page = p) => page.screenshot({ path: `${OUT}/${n}.png` });

try {
  // 1. Premier compte administrateur avec le code d'installation du script
  const { code } = await j('/__test/setup-code');
  await p.goto(`${BASE}#/admin`);
  await p.getByRole('heading', { name: 'Créer le compte administrateur' }).waitFor();
  await p.getByLabel('Code d\'installation').fill(code);
  await p.getByLabel('Votre nom').fill('Administrateur');
  await p.getByLabel(/Adresse e-mail/).fill('admin@sanctimaps.fr');
  await p.getByLabel('Mot de passe').fill('MotDePasse2026xx');
  await shot('01-creation-compte');
  await p.getByRole('button', { name: 'Créer mon compte' }).click();
  await p.getByRole('heading', { name: 'Tableau de bord' }).waitFor();
  ok('compte administrateur créé avec le code d\'installation');

  // 2. Réglages d'envoi : alias Gmail, DNS, politique
  await p.goto(`${BASE}#/admin/parametres?onglet=envoi`);
  await p.getByText('Envoi par Gmail avec votre adresse IONOS').waitFor();
  await p.getByRole('button', { name: 'Vérifier l\'adresse d\'expédition' }).click();
  await p.getByText(/est bien configurée dans Gmail/).first().waitFor();
  await shot('02-envoi-gmail-ionos');
  await p.goto(`${BASE}#/admin/parametres?onglet=domaine`);
  await p.getByLabel(/Sélecteur DKIM/).fill('s1-ionos');
  await p.getByRole('button', { name: 'Enregistrer' }).first().click();
  await p.getByText('Paramètres enregistrés.').first().waitFor();
  await p.getByRole('button', { name: 'Vérifier maintenant' }).click();
  await p.getByText('Vérification DNS effectuée.').waitFor();
  await p.goto(`${BASE}#/admin/parametres?onglet=confidentialite`);
  await p.getByLabel(/relu et validé/).check();
  await p.getByRole('button', { name: 'Enregistrer' }).first().click();
  await p.getByText('Paramètres enregistrés.').first().waitFor();
  ok('adresse IONOS vérifiée dans Gmail, DNS vérifiés, politique validée');

  // 3. Inscription publique et double opt-in
  const pub = await ctx.newPage();
  await pub.goto(`${BASE}#/inscription`);
  await pub.getByLabel('Prénom').fill('Bernadette');
  await pub.getByLabel(/Adresse e-mail/).fill('bernadette@exemple.fr');
  await pub.getByRole('checkbox').check();
  await pub.waitForTimeout(2600);
  await pub.getByRole('button', { name: /Je m'inscris/ }).click();
  await pub.getByText('Vérifiez votre boîte mail').waitFor();
  const conf = await mailTo('bernadette@exemple.fr', /Confirmez/);
  if (!conf.from.includes('newsletter@sanctimaps.fr')) throw new Error('Expéditeur incorrect : ' + conf.from);
  await pub.goto(linkIn(conf, /href="([^"]*#\/confirmation\?t=[^"]+)"/));
  await pub.getByText(/Inscription confirmée, Bernadette/).waitFor();
  ok('inscription, e-mail envoyé depuis newsletter@sanctimaps.fr, confirmation par le lien');

  // 4. Newsletter + campagne
  await p.goto(`${BASE}#/admin/creer`);
  await p.getByRole('button', { name: /Newsletter éditoriale/ }).click();
  await p.getByLabel('Titre interne').fill('Lettre du 1er décembre');
  await p.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await p.getByText('Newsletter enregistrée.').waitFor();
  await p.getByRole('button', { name: /Créer une campagne/ }).click();
  await p.getByLabel(/Nom interne/).fill('Lettre du 1er décembre');
  await p.getByLabel(/Objet de l'e-mail/).fill('Saint Éloi, patron des orfèvres');
  for (let i = 0; i < 2; i++) await p.getByRole('button', { name: /Suivant/ }).click();
  await p.waitForFunction(() => /^\s*1\s*$/.test(document.querySelector('[aria-live="polite"]')?.textContent ?? ''));
  await p.getByRole('button', { name: /Suivant/ }).click();
  await p.getByLabel('Adresse de test').fill('admin@sanctimaps.fr');
  await p.getByRole('button', { name: /Envoyer le test/ }).click();
  await p.getByText('Test accepté par le serveur d\'envoi').waitFor();
  await p.goto(`${BASE}#/admin/parametres?onglet=envoi`);
  await p.getByRole('switch', { name: /Envois réels autorisés/ }).click();
  await p.getByRole('button', { name: 'Autoriser' }).click();
  await p.getByText('Envois réels autorisés.').waitFor();
  ok('newsletter enregistrée, e-mail de test accepté, envois réels autorisés');

  await p.goto(`${BASE}#/admin/campagnes`);
  await p.getByRole('link', { name: 'Lettre du 1er décembre' }).click();
  await p.getByRole('link', { name: 'Modifier' }).click();
  for (let i = 0; i < 5; i++) await p.getByRole('button', { name: /Suivant/ }).click();
  await p.getByRole('checkbox').check();
  await p.getByRole('button', { name: /Envoyer à 1/ }).click();
  await p.waitForURL(/#\/admin\/campagnes\/\d+$/);
  await j('/__test/run'); // passage du déclencheur Google (toutes les 5 min en production)
  await p.reload();
  await p.getByText('Envoyée', { exact: true }).first().waitFor();
  await shot('03-campagne-envoyee');
  const letter = await mailTo('bernadette@exemple.fr', /Saint Éloi/);
  if (!letter.headers['list-unsubscribe']?.includes('action=unsubscribe')) throw new Error('List-Unsubscribe absent');
  if (!letter.text.includes('Bonjour Bernadette')) throw new Error('Personnalisation absente');
  ok('campagne envoyée par le déclencheur, personnalisée, avec désinscription en un clic');

  // 5. Clic suivi puis désinscription depuis la lettre
  // La redirection part vers https://sanctimaps.fr/ (le site lui-même peut être injoignable depuis l'environnement de test)
  const redirected = pub.waitForRequest((r) => r.url().startsWith('https://sanctimaps.fr/'));
  await pub.goto(linkIn(letter, /href="([^"]*#\/r\?k=[^"]+)"/));
  await redirected;
  await pub.goto(linkIn(letter, /href="([^"]*#\/desinscription\?t=[^"]+)"/));
  await pub.getByRole('button', { name: 'Confirmer la désinscription' }).click();
  await pub.getByText('Vous êtes désinscrit(e)').waitFor();
  await p.goto(`${BASE}#/admin/campagnes`);
  await p.getByRole('link', { name: 'Lettre du 1er décembre' }).click();
  await p.getByText('Clics').first().waitFor();
  await shot('04-statistiques-campagne');
  ok('clic enregistré et redirigé ; désinscription par le lien de la lettre');

  // 6. Tableau de bord et mobile
  await p.goto(`${BASE}#/admin`);
  await p.getByText('Abonnés confirmés').waitFor(); await p.waitForTimeout(500);
  await shot('05-tableau-de-bord');
  const m = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const mp = await m.newPage();
  await mp.goto(`${BASE}#/inscription`);
  await mp.getByRole('button', { name: /Je m'inscris/ }).waitFor();
  await shot('06-mobile-inscription', mp);
  ok('tableau de bord et affichage mobile');
} catch (e) {
  errors.push(e.message.split('\n')[0]);
  await shot('erreur');
}
console.log(errors.length ? `Erreurs : ${JSON.stringify(errors, null, 1)}` : '\nParcours complet réussi (site + script Google).');
await browser.close();
