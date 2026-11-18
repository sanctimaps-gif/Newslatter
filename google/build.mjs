// Assemble le script Google en un seul fichier Code.gs (à coller dans l'éditeur Apps Script).
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'dist');
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [resolve(here, 'src/main.ts')],
  bundle: true, format: 'iife', globalName: '__snl', target: 'es2019', platform: 'neutral',
  loader: { '.md': 'text' }, outfile: resolve(out, 'bundle.js'), legalComments: 'none', charset: 'utf8',
});

const exported = ['doGet', 'doPost', 'installer', 'traiterFile', 'utiliserSousDomaine'];
const header = `/**
 * SanctiMaps Newsletter Studio — script Google (généré, ne pas modifier à la main).
 * Source : https://github.com/sanctimaps-gif/Newslatter (dossier google/).
 * Installation : voir documentation/google.md
 */
`;
const wrappers = exported.map((f) => `function ${f}(e) { return __snl.${f}(e); }`).join('\n');
writeFileSync(resolve(out, 'Code.gs'), `${header}${wrappers}\n\n${readFileSync(resolve(out, 'bundle.js'), 'utf8')}`);
copyFileSync(resolve(here, 'appsscript.json'), resolve(out, 'appsscript.json'));
console.log(`google/dist/Code.gs (${Math.round(readFileSync(resolve(out, 'Code.gs')).length / 1024)} Ko)`);
