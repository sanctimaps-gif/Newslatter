// Vérifie la démonstration GitHub Pages, servie sous /Newslatter/ comme sur github.io, sur un iPhone simulé.
// Usage : servir le dossier parent du dépôt (python3 -m http.server 8090) puis node e2e/demo.mjs [dossier-captures]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.DEMO_URL ?? 'http://localhost:8090/Newslatter/';
const OUT = process.argv[2] ?? 'test-results/demo';
const errors = [];
const ok = (m) => console.log(`✔ ${m}`);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await p.goto(BASE);
  await p.waitForURL(/demo\/#\/admin/);
  await p.getByRole('heading', { name: 'Tableau de bord' }).waitFor();
  await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/demo-1-dashboard.png` }); ok('tableau de bord');
  await p.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await p.screenshot({ path: `${OUT}/demo-2-menu.png` });
  await p.getByRole('complementary', { name: 'Menu' }).getByRole('link', { name: 'Créer une newsletter' }).click();
  await p.getByRole('button', { name: /Newsletter éditoriale/ }).click();
  await p.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await p.getByText('Newsletter enregistrée.').waitFor();
  await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/demo-3-editeur.png` }); ok('éditeur et enregistrement');
  await p.goto(`${BASE}demo/#/admin/abonnes`);
  await p.getByRole('button', { name: 'Ajouter' }).click();
  await p.getByLabel('Adresse e-mail').fill('essai@exemple.fr');
  await p.getByRole('button', { name: 'Ajouter', exact: true }).last().click();
  await p.locator('ul li', { hasText: 'essai@exemple.fr' }).waitFor(); ok('ajout d\'un abonné');
  await p.reload(); await p.locator('ul li', { hasText: 'essai@exemple.fr' }).waitFor(); ok('données conservées après rechargement');
  for (const h of ['modeles', 'campagnes/nouvelle', 'statistiques', 'automatisations', 'parametres', 'projet']) {
    await p.goto(`${BASE}demo/#/admin/${h}`); await p.waitForTimeout(500);
  }
  await p.screenshot({ path: `${OUT}/demo-4-projet.png` }); ok('autres pages');
  await p.goto(`${BASE}demo/#/inscription`); await p.getByRole('button', { name: /Je m'inscris/ }).waitFor(); ok('page d\'inscription');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (overflow) errors.push('défilement horizontal');
} catch (e) { errors.push(e.message); await p.screenshot({ path: `${OUT}/demo-erreur.png` }); }
console.log(errors.length ? `Erreurs : ${JSON.stringify(errors, null, 1)}` : 'Démonstration OK.');
await browser.close();
