// Applique les migrations SQL versionnées de database/migrations, une seule fois chacune, dans l'ordre.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT_DIR } from '../config/env.ts';
import { pool } from '../lib/db.ts';

export async function migrate(log = console.log) {
  const dir = resolve(ROOT_DIR, 'database/migrations');
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await pool.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(readFileSync(resolve(dir, file), 'utf8'));
      await c.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
      await c.query('COMMIT');
      log(`✔ migration appliquée : ${file}`);
    } catch (e) {
      await c.query('ROLLBACK');
      throw new Error(`Échec de la migration ${file} : ${(e as Error).message}`);
    } finally { c.release(); }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(() => { console.log('Base à jour.'); return pool.end(); }).catch((e) => { console.error(e.message); process.exit(1); });
}
