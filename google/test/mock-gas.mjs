// Simulation fidèle (pour les tests) des services Google Apps Script utilisés par le script.
import { createHash, createHmac, randomUUID } from 'node:crypto';

const toSigned = (buf) => [...buf].map((x) => (x > 127 ? x - 256 : x));
const toBuf = (v, charset) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map((x) => (x < 0 ? x + 256 : x))));

class Range {
  constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr, nc }); }
  getValues() { const out = []; for (let r = 0; r < this.nr; r++) { const line = []; for (let c = 0; c < this.nc; c++) line.push(this.sheet.cells[this.row - 1 + r]?.[this.col - 1 + c] ?? ''); out.push(line); } return out; }
  setValues(v) {
    v.forEach((line, r) => line.forEach((val, c) => {
      if (typeof val === 'string' && val.startsWith('=')) throw new Error(`Formule interdite dans les tests : ${val}`);
      (this.sheet.cells[this.row - 1 + r] ??= [])[this.col - 1 + c] = val;
    }));
    return this;
  }
  clearContent() { for (let r = 0; r < this.nr; r++) for (let c = 0; c < this.nc; c++) if (this.sheet.cells[this.row - 1 + r]) this.sheet.cells[this.row - 1 + r][this.col - 1 + c] = ''; return this; }
  setNumberFormat() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.cells = []; this.maxRows = 1000; }
  getName() { return this.name; }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  getLastRow() { for (let i = this.cells.length - 1; i >= 0; i--) if (this.cells[i]?.some((x) => x !== '' && x != null)) return i + 1; return 0; }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(_a, n) { this.maxRows += n; }
  setFrozenRows() {}
}
class Book {
  constructor() { this.sheets = new Map([['Feuille 1', new Sheet('Feuille 1')]]); }
  getId() { return 'book-1'; }
  getSheetByName(n) { return this.sheets.get(n) ?? null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.set(n, s); return s; }
  getSheets() { return [...this.sheets.values()]; }
  deleteSheet(s) { this.sheets.delete(s.getName()); }
}

function parseCsv(text, delim = ',') {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function createGas({ account = 'compte.exemple@gmail.com', aliases = ['newsletter@sanctimaps.fr'], quota = 100 } = {}) {
  const book = new Book();
  const props = new Map();
  const cache = new Map();
  const sent = [];        // e-mails « envoyés » (API Gmail ou GmailApp)
  const inbox = [];       // avis de non-distribution simulés
  const drive = new Map();
  const triggers = [];
  let remaining = quota;
  let reject = null; // adresses refusées par le serveur destinataire (activé par le test)
  const blob = (bytes, type, name) => ({ getBytes: () => bytes, getDataAsString: () => Buffer.from(bytes.map((x) => (x < 0 ? x + 256 : x))).toString('utf8'), type, name });

  const g = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => book, openById: () => book, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, String(v)), deleteProperty: (k) => props.delete(k) }) },
    CacheService: { getScriptCache: () => ({ get: (k) => { const e = cache.get(k); return e && e.exp > Date.now() ? e.v : null; }, put: (k, v, ttl = 600) => cache.set(k, { v, exp: Date.now() + ttl * 1000 }), remove: (k) => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      Charset: { UTF_8: 'UTF-8' }, DigestAlgorithm: { SHA_256: 'sha256' }, MacAlgorithm: { HMAC_SHA_1: 'sha1' },
      computeDigest: (alg, s) => toSigned(createHash(alg).update(s, 'utf8').digest()),
      computeHmacSha256Signature: (v, k) => toSigned(createHmac('sha256', toBuf(k)).update(toBuf(v)).digest()),
      computeHmacSignature: (alg, v, k) => toSigned(createHmac(alg, toBuf(k)).update(toBuf(v)).digest()),
      getUuid: () => randomUUID(),
      base64Encode: (v) => toBuf(v).toString('base64'),
      base64EncodeWebSafe: (v) => toBuf(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64Decode: (s) => toSigned(Buffer.from(s, 'base64')),
      newBlob: (data, type, name) => blob(typeof data === 'string' ? toSigned(Buffer.from(data, 'utf8')) : data, type, name),
      parseCsv,
    },
    MailApp: { getRemainingDailyQuota: () => remaining },
    Session: { getEffectiveUser: () => ({ getEmail: () => account }) },
    GmailApp: {
      getAliases: () => aliases,
      sendEmail: (to, subject, text, opts) => { if (reject?.test(to)) throw new Error('Invalid email: ' + to); remaining--; sent.push({ to, subject, text, html: opts.htmlBody, from: opts.from ?? account, headers: {} }); },
      search: () => inbox.filter((t) => !t.labeled),
      getUserLabelByName: () => null,
      createLabel: (n) => ({ name: n }),
    },
    Gmail: { Users: { Messages: { send: ({ raw }) => {
      const mime = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      const [head, ...rest] = mime.split('\r\n\r\n');
      const headers = Object.fromEntries(head.split('\r\n').map((l) => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
      const to = headers.to;
      if (reject?.test(to)) throw new Error('Invalid To header');
      const parts = rest.join('\r\n\r\n').split(/--snl_[a-f0-9]+/).map((p) => p.split('\r\n\r\n')[1]?.replace(/\r\n/g, '')).filter(Boolean).map((b) => Buffer.from(b, 'base64').toString('utf8'));
      remaining--;
      const subj = headers.subject.startsWith('=?UTF-8?B?') ? Buffer.from(headers.subject.slice(10, -2), 'base64').toString('utf8') : headers.subject;
      sent.push({ to, subject: subj, text: parts[0], html: parts[1], from: headers.from, headers });
      return { id: `msg-${sent.length}` };
    } } } },
    UrlFetchApp: { fetch: (url) => ({ getContentText: () => JSON.stringify(/_dmarc/.test(url) ? { Answer: [{ type: 16, data: '"v=DMARC1; p=none"' }] } : /_domainkey/.test(url) ? { Answer: [{ type: 16, data: '"v=DKIM1; k=rsa; p=MIGf"' }] } : { Answer: [{ type: 16, data: '"v=spf1 include:_spf-eu.ionos.com ~all"' }] }) }) },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'link' }, Permission: { VIEW: 'view' },
      createFolder: () => ({ getId: () => 'folder-1', createFile: (b) => { const id = `file-${drive.size + 1}`; drive.set(id, b); return { getId: () => id, setSharing() {} }; } }),
      getFolderById: () => g.DriveApp.createFolder(),
      getFileById: (id) => ({ setTrashed: () => drive.delete(id) }),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ content: s, setMimeType() { return this; }, getContent: () => s }) },
    HtmlService: { createHtmlOutput: (s) => ({ content: s }) },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
      getProjectTriggers: () => triggers, deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (m) => ({ create: () => triggers.push({ fn, m, getHandlerFunction: () => fn }) }) }) }),
    },
    Logger: { log: () => {} },
  };
  return { globals: g, book, props, cache, sent, inbox, triggers, setQuota: (n) => { remaining = n; }, setReject: (re) => { reject = re; } };
}
