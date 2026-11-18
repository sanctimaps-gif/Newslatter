// Insère les 6 modèles de départ (une seule fois) et une politique de confidentialité à personnaliser.
// Aucun abonné, aucune statistique fictive n'est créé.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { starterTemplates } from '../../../shared/src/index.ts';
import { ROOT_DIR } from '../config/env.ts';
import { one, pool, query } from '../lib/db.ts';

export async function seed(log = console.log) {
  for (const t of starterTemplates()) {
    const exists = await one('SELECT 1 FROM newsletter_templates WHERE is_system AND name=$1', [t.name]);
    if (exists) continue;
    await query(`INSERT INTO newsletter_templates(name, description, category, is_system, design) VALUES ($1,$2,$3,true,$4)`, [t.name, t.description, t.category, JSON.stringify(t.design)]);
    log(`✔ modèle : ${t.name}`);
  }
  const p = await one(`SELECT 1 FROM settings WHERE key='privacyPolicy'`);
  if (!p) {
    const md = readFileSync(resolve(ROOT_DIR, 'database/seeds/politique-confidentialite.md'), 'utf8');
    await query(`INSERT INTO settings(key, value) VALUES ('privacyPolicy', $1)`, [JSON.stringify({ markdown: md, reviewed: false })]);
    log('✔ politique de confidentialité (brouillon à relire)');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
