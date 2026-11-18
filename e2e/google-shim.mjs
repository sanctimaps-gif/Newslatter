// Serveur de test local : sert le site compilé pour GitHub Pages sous /Newslatter/ et exécute
// google/dist/Code.gs dans la simulation des services Google (aucun accès à Google, aucun e-mail réel).
// Usage : node e2e/google-shim.mjs   (écoute uniquement sur 127.0.0.1:8092)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createGas } from '../google/test/mock-gas.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = resolve(root, 'frontend/dist-pages');
const PORT = 8092;
const gas = createGas();
const ctx = vm.createContext({ ...gas.globals });
vm.runInContext(readFileSync(resolve(root, 'google/dist/Code.gs'), 'utf8'), ctx);
const setupCode = ctx.installer();
ctx.__snl; // eslint
gas.props.set('SITE_URL', `http://127.0.0.1:${PORT}/Newslatter/`);

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };

createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'POST' && url.pathname === '/script') {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => { const out = ctx.doPost({ postData: { contents: body }, parameter: Object.fromEntries(url.searchParams) }); send(res, 200, out.getContent()); });
    return;
  }
  if (url.pathname === '/__test/setup-code') return send(res, 200, { code: setupCode });
  if (url.pathname === '/__test/mails') return send(res, 200, gas.sent);
  if (url.pathname === '/__test/run') return send(res, 200, ctx.traiterFile());
  if (url.pathname === '/Newslatter/config.json') return send(res, 200, { scriptUrl: `http://127.0.0.1:${PORT}/script`, siteUrl: `http://127.0.0.1:${PORT}/Newslatter/` });
  if (!url.pathname.startsWith('/Newslatter/')) return send(res, 404, 'introuvable', 'text/plain');
  let file = normalize(resolve(site, `.${url.pathname.slice('/Newslatter'.length)}`));
  if (!file.startsWith(site)) return send(res, 403, 'interdit', 'text/plain');
  if (existsSync(file) && statSync(file).isDirectory()) file = resolve(file, 'index.html');
  if (!existsSync(file)) return send(res, 404, 'introuvable', 'text/plain');
  send(res, 200, readFileSync(file), types[extname(file)] ?? 'application/octet-stream');
}).listen(PORT, '127.0.0.1', () => console.log(`Site de test : http://127.0.0.1:${PORT}/Newslatter/`));
