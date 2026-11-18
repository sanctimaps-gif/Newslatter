// Parcours de bout en bout dans un vrai navigateur, contre une plateforme lancée en local
// (API + worker + interface + boîte de test SMTP en mode bac à sable).
// Usage : ADMIN_EMAIL=… ADMIN_PASSWORD=… node e2e/parcours.mjs [dossier-captures]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright'); // Playwright préinstallé ou installé localement
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const MAIL = process.env.MAILBOX_URL ?? 'http://127.0.0.1:1080';
const OUT = process.argv[2] ?? 'test-results/e2e';
mkdirSync(OUT, { recursive: true });
const reader = `lecteur.${Date.now()}@exemple.fr`;
const errors = [];
const step = (m) => console.log(`✔ ${m}`);
const mails = async () => (await fetch(`${MAIL}/api/messages`)).json();
async function waitMail(pred, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const m = (await mails()).find(pred); if (m) return m; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('E-mail attendu non reçu');
}
const raw = async (id) => (await fetch(`${MAIL}/m/${id}/html`)).text();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
const page = await ctx.newPage();
// Ignorés : logo chargé depuis https://sanctimaps.fr si le réseau de test ne l'autorise pas, et 401 attendus
// (accès avant connexion, mauvais mot de passe volontaire).
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|status of 401/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
const shot = (name, p = page) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

try {
  // 1. Inscription publique
  await page.goto(`${BASE}/inscription`);
  await page.getByLabel('Prénom').fill('Bernadette');
  await page.getByLabel(/Adresse e-mail/).fill(reader);
  await shot('01-inscription');
  await page.getByRole('button', { name: /Je m'inscris/ }).click();
  await page.getByText('Merci de cocher la case').waitFor();
  await page.getByRole('checkbox').check();
  await page.waitForTimeout(2600);
  await page.getByRole('button', { name: /Je m'inscris/ }).click();
  await page.getByText('Vérifiez votre boîte mail').waitFor();
  step('inscription envoyée');

  // 2. Double opt-in
  const conf = await waitMail((m) => m.to.includes(reader) && /Confirmez/.test(m.subject));
  const link = (await raw(conf.id)).match(/href="([^"]*\/confirmation\?t=[^"]+)"/)[1].replace(/&amp;/g, '&');
  await page.goto(link);
  await page.getByText(/Inscription confirmée, Bernadette/).waitFor();
  await shot('02-confirmation');
  step('double opt-in confirmé par le lien reçu');

  // 3. Connexion
  await page.goto(`${BASE}/admin`);
  await page.waitForURL(/connexion/);
  await page.getByLabel('Adresse e-mail').fill(process.env.ADMIN_EMAIL);
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByText('Identifiants incorrects.').waitFor();
  await page.getByLabel('Mot de passe').fill(process.env.ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('heading', { name: 'Tableau de bord' }).waitFor();
  await page.getByText('Abonnés confirmés').waitFor();
  step('connexion administrateur');

  // 4. Abonnés
  await page.getByRole('link', { name: 'Abonnés', exact: true }).click();
  await page.getByPlaceholder(/Rechercher/).fill('bernadette');
  await page.getByRole('cell', { name: reader }).waitFor();
  await page.getByRole('button', { name: 'Fiche' }).first().click();
  await page.getByText('Confirmation (double opt-in)').waitFor();
  await shot('04-fiche-abonne');
  await page.keyboard.press('Escape');
  step('abonné visible et preuve de consentement affichée');

  // 5. Éditeur : modèle éditorial
  await page.getByRole('link', { name: 'Créer une newsletter' }).click();
  await page.getByRole('button', { name: /Newsletter éditoriale/ }).click();
  await page.getByLabel('Titre interne').fill('Lettre de test — saint Vincent de Paul');
  await page.locator('main').getByText("Saint Vincent de Paul, l'apôtre de la charité").first().click();
  const ta = page.locator('textarea[id^="t-"]');
  await ta.fill('Saint Vincent de Paul, apôtre de la charité');
  await page.getByRole('button', { name: 'Bouton', exact: true }).click(); // ajoute un bloc bouton sous la sélection
  await page.getByLabel('Libellé').fill('Lire sa vie sur SanctiMaps');
  await page.getByRole('button', { name: 'Monter' }).first().click();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Newsletter enregistrée.').waitFor();
  await shot('05-editeur');
  await page.getByRole('tab', { name: /Mobile/ }).click();
  await page.waitForTimeout(500);
  await shot('06-apercu-mobile');
  await page.getByRole('tab', { name: /Rendu final/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('tab', { name: /Édition/ }).click();
  step('newsletter composée, blocs ajoutés/déplacés, enregistrée');

  // 6. Assistant de campagne
  await page.getByRole('button', { name: /Créer une campagne/ }).click();
  await page.getByLabel(/Nom interne/).fill('Campagne de test');
  await page.getByLabel(/Objet de l'e-mail/).fill('Saint Vincent de Paul, l\'apôtre de la charité');
  await page.getByRole('button', { name: /Suivant/ }).click();
  await page.getByRole('button', { name: /Suivant/ }).click();
  await page.getByText('Destinataires éligibles').waitFor();
  await page.waitForFunction(() => /\d/.test(document.querySelector('[aria-live="polite"]')?.textContent ?? ''));
  await shot('07-destinataires');
  await page.getByRole('button', { name: /Suivant/ }).click();
  await page.getByLabel('Adresse de test').fill('admin@sanctimaps.fr');
  await page.getByRole('button', { name: /Envoyer le test/ }).click();
  await page.getByText('Test accepté par le serveur d\'envoi').waitFor();
  await waitMail((m) => m.subject.startsWith('[TEST]'));
  await page.getByRole('button', { name: /Suivant/ }).click();
  await page.getByText('5. Récapitulatif').waitFor();
  await shot('08-recapitulatif');
  await page.getByRole('button', { name: /Suivant/ }).click();
  await page.getByRole('checkbox').check();
  await shot('09-envoi');
  await page.getByRole('button', { name: /Envoyer à/ }).click();
  await page.waitForURL(/\/admin\/campagnes\/\d+$/);
  await page.getByText('Envoyée', { exact: true }).first().waitFor({ timeout: 30000 });
  await shot('10-campagne-envoyee');
  step('test contrôlé puis campagne envoyée par le worker');

  // 7. E-mail reçu : en-têtes et lien de désinscription personnel
  const camp = await waitMail((m) => m.to.includes(reader) && m.subject.startsWith('Saint Vincent'));
  if (!camp.headers['list-unsubscribe']?.includes('one-click')) throw new Error('En-tête List-Unsubscribe manquant');
  const html = await raw(camp.id);
  if (!html.includes('Bonjour Bernadette')) throw new Error('Personnalisation absente');
  const unsub = html.match(/href="([^"]*\/desinscription\?t=[^"]+)"/)[1].replace(/&amp;/g, '&');
  const pub = await ctx.newPage();
  await pub.goto(unsub);
  await pub.getByRole('button', { name: 'Confirmer la désinscription' }).click();
  await pub.getByText('Vous êtes désinscrit(e)').waitFor();
  await shot('11-desinscription', pub);
  step('e-mail personnalisé reçu, List-Unsubscribe présent, désinscription par le lien');

  // 8. Autres pages
  for (const [path, name, text] of [['/admin', '12-tableau-de-bord', 'Évolution du nombre d\'abonnés'], ['/admin/statistiques', '13-statistiques', 'Performances par campagne'], ['/admin/modeles', '14-modeles', 'Newsletter minimaliste'], ['/admin/automatisations', '15-automatisations', 'E-mail de bienvenue'], ['/admin/parametres?onglet=envoi', '16-parametres-envoi', 'Autorisation des envois réels'], ['/admin/parametres?onglet=domaine', '17-dns', 'Enregistrements à ajouter'], ['/admin/programmation', '18-programmation', 'Programmation'], ['/admin/projet', '19-cahier-des-charges', 'Suivi du cahier des charges']]) {
    await page.goto(`${BASE}${path}`);
    await page.getByText(text).first().waitFor();
    await page.waitForTimeout(400);
    await shot(name);
  }
  step('toutes les pages d\'administration s\'affichent');

  // 9. Mobile
  const m = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', storageState: await ctx.storageState() });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push(e.message));
  await mp.goto(`${BASE}/admin/abonnes`);
  await mp.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await mp.getByRole('link', { name: 'Campagnes' }).waitFor();
  await shot('20-mobile-menu', mp);
  await mp.goto(`${BASE}/inscription`);
  await shot('21-mobile-inscription', mp);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error('Défilement horizontal sur mobile');
  step('affichage mobile (menu tiroir, pas de défilement horizontal)');

  // 10. Déconnexion
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await page.waitForURL(/connexion/);
  await page.goto(`${BASE}/admin/abonnes`);
  await page.waitForURL(/connexion/);
  step('déconnexion et protection des routes privées');

  if (errors.length) { console.error('Erreurs console :', errors); process.exitCode = 1; }
  else console.log('\nParcours complet réussi, aucune erreur dans la console.');
} catch (e) {
  console.error('✖', e.message);
  await shot('erreur');
  if (errors.length) console.error('Erreurs console :', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
