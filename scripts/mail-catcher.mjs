// Boîte de test SMTP locale (développement uniquement).
// - Écoute en SMTP sur 127.0.0.1:1025, capture TOUS les messages, n'envoie rien vers Internet.
// - Interface web de lecture : http://127.0.0.1:1080
// - Simulation de rebonds pour tester leur traitement :
//     *rebond*@…      → 550 5.1.1 adresse inexistante (rebond permanent)
//     *temporaire*@…  → 451 4.2.2 boîte indisponible (refus temporaire)
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { createServer } from 'node:http';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../.dev-mail');
mkdirSync(DIR, { recursive: true });
const SMTP_PORT = Number(process.env.SANDBOX_SMTP_PORT ?? 1025);
const HTTP_PORT = Number(process.env.SANDBOX_HTTP_PORT ?? 1080);

const smtp = new SMTPServer({
  authOptional: true, disabledCommands: ['STARTTLS'], logger: false, size: 10 * 1024 * 1024,
  onRcptTo(addr, _s, cb) {
    if (/rebond/i.test(addr.address)) return cb(Object.assign(new Error('5.1.1 <' + addr.address + '>: Recipient address rejected: User unknown'), { responseCode: 550 }));
    if (/temporaire/i.test(addr.address)) return cb(Object.assign(new Error('4.2.2 Mailbox temporarily unavailable'), { responseCode: 451 }));
    cb();
  },
  onData(stream, session, cb) {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', async () => {
      const raw = Buffer.concat(chunks);
      const parsed = await simpleParser(raw);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeFileSync(join(DIR, `${id}.eml`), raw);
      writeFileSync(join(DIR, `${id}.json`), JSON.stringify({
        id, receivedAt: new Date().toISOString(), from: parsed.from?.text, to: session.envelope.rcptTo.map((r) => r.address),
        subject: parsed.subject, html: parsed.html || '', text: parsed.text || '',
        headers: Object.fromEntries([...parsed.headers].filter(([k]) => /^(list-|x-|message-id|reply-to|precedence)/i.test(k)).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])),
      }));
      console.log(`📨 capturé : « ${parsed.subject} » → ${session.envelope.rcptTo.map((r) => r.address).join(', ')}`);
      cb(null, `250 OK: message capturé ${id}`);
    });
  },
});
smtp.listen(SMTP_PORT, '127.0.0.1', () => console.log(`Boîte de test SMTP sur 127.0.0.1:${SMTP_PORT}`));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function list() {
  return readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().reverse().map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')));
}
createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/messages') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(list().map(({ html, ...m }) => m))); }
  const m = url.pathname.match(/^\/m\/([\w-]+)(\/html)?$/);
  if (m) {
    const msg = list().find((x) => x.id === m[1]);
    if (!msg) { res.statusCode = 404; return res.end('Introuvable'); }
    if (m[2]) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(msg.html || `<pre>${esc(msg.text)}</pre>`); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html><meta charset="utf-8"><title>${esc(msg.subject)}</title><body style="font-family:system-ui;margin:0;background:#f7f2e8">
<div style="padding:12px 20px;background:#fffdf8;border-bottom:1px solid #ded3c0"><a href="/">← Boîte de test</a><h2 style="margin:8px 0">${esc(msg.subject)}</h2>
<div>De : ${esc(msg.from)}<br>À : ${esc(msg.to.join(', '))}<br>${Object.entries(msg.headers).map(([k, v]) => `<small>${esc(k)}: ${esc(v)}</small>`).join('<br>')}</div></div>
<iframe src="/m/${msg.id}/html" style="width:100%;height:80vh;border:0;background:#fff"></iframe><details style="padding:20px"><summary>Version texte</summary><pre>${esc(msg.text)}</pre></details></body>`);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><title>Boîte de test — SanctiMaps</title><body style="font-family:system-ui;background:#f7f2e8;color:#24201b;margin:0;padding:24px">
<h1 style="font-family:Georgia,serif;color:#8c2230">Boîte de test locale</h1><p>Messages capturés en mode bac à sable — <strong>rien n'est envoyé sur Internet</strong>.</p>
<table style="width:100%;border-collapse:collapse;background:#fffdf8">${list().map((x) => `<tr style="border-bottom:1px solid #ded3c0"><td style="padding:8px">${esc(new Date(x.receivedAt).toLocaleString('fr-FR'))}</td><td>${esc(x.to.join(', '))}</td><td><a href="/m/${x.id}">${esc(x.subject)}</a></td></tr>`).join('') || '<tr><td style="padding:12px">Aucun message.</td></tr>'}</table></body>`);
}).listen(HTTP_PORT, '127.0.0.1', () => console.log(`Interface de la boîte de test : http://127.0.0.1:${HTTP_PORT}`));
