// Construit le site pour GitHub Pages et le place à la racine du dépôt (branche publiée par Pages).
// Usage : npm run pages
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'frontend/dist-pages');
execSync('npx vite build', { cwd: resolve(root, 'frontend'), stdio: 'inherit', env: { ...process.env, VITE_BACKEND: 'google' } });
// Nettoie la publication précédente (uniquement les fichiers produits par ce script)
if (existsSync(resolve(root, 'assets'))) rmSync(resolve(root, 'assets'), { recursive: true });
for (const f of readdirSync(dist)) cpSync(resolve(dist, f), resolve(root, f), { recursive: true });
writeFileSync(resolve(root, '.nojekyll'), '');
console.log('Site publié à la racine du dépôt :', readdirSync(dist).join(', '));
