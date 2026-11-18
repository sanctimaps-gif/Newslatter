"use strict";
var __snl = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // google/src/main.ts
  var main_exports = {};
  __export(main_exports, {
    doGet: () => doGet,
    doPost: () => doPost,
    installer: () => installer,
    traiterFile: () => traiterFile,
    utiliserSousDomaine: () => utiliserSousDomaine,
    withDb: () => withDb
  });

  // google/src/crypto.ts
  var toUnsigned = (b2) => b2.map((x) => x < 0 ? x + 256 : x);
  var toSigned = (b2) => b2.map((x) => x > 127 ? x - 256 : x);
  var hex = (b2) => toUnsigned(b2).map((x) => x.toString(16).padStart(2, "0")).join("");
  var utf8 = (s) => Utilities.newBlob(s).getBytes();
  function sha256(s) {
    return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
  }
  function hmacBytes(value, key) {
    return Utilities.computeHmacSha256Signature(toSigned(value), toSigned(key));
  }
  function hmac(s, secret2) {
    return hex(hmacBytes(utf8(s), utf8(secret2)));
  }
  function randomToken() {
    return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  }
  function pbkdf2(password, saltHex, iterations) {
    var _a;
    const P = utf8(password);
    const salt = ((_a = saltHex.match(/../g)) != null ? _a : []).map((h) => parseInt(h, 16));
    let u = hmacBytes([...salt, 0, 0, 0, 1], P).map((x) => x < 0 ? x + 256 : x);
    const t = u.slice();
    for (let i = 1; i < iterations; i++) {
      u = hmacBytes(u, P).map((x) => x < 0 ? x + 256 : x);
      for (let j = 0; j < t.length; j++) t[j] ^= u[j];
    }
    return hex(t);
  }
  var ITERATIONS = 5e3;
  function hashPassword(pw) {
    const salt = sha256(randomToken()).slice(0, 32);
    return `pbkdf2$${ITERATIONS}$${salt}$${pbkdf2(pw, salt, ITERATIONS)}`;
  }
  function verifyPassword(pw, stored) {
    const [alg, it, salt, h] = String(stored != null ? stored : "").split("$");
    if (alg !== "pbkdf2") return false;
    return safeEqual(pbkdf2(pw, salt, Number(it)), h);
  }
  function safeEqual(a, b2) {
    if (a.length !== b2.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b2.charCodeAt(i);
    return r === 0;
  }
  var B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  function newTotpSecret() {
    var _a;
    const bytes = ((_a = sha256(randomToken()).match(/../g)) != null ? _a : []).slice(0, 20).map((h) => parseInt(h, 16));
    let bits = 0, value = 0, out = "";
    for (const byte of bytes) {
      value = value << 8 | byte;
      bits += 8;
      while (bits >= 5) {
        out += B32[value >>> bits - 5 & 31];
        bits -= 5;
      }
    }
    return out;
  }
  function b32decode(s) {
    let bits = 0, value = 0;
    const out = [];
    for (const ch of s.toUpperCase()) {
      const i = B32.indexOf(ch);
      if (i < 0) continue;
      value = value << 5 | i;
      bits += 5;
      if (bits >= 8) {
        out.push(value >>> bits - 8 & 255);
        bits -= 8;
      }
    }
    return out;
  }
  function totpCode(secret2, time = Date.now()) {
    let counter2 = Math.floor(time / 3e4);
    const msg = [];
    for (let i = 7; i >= 0; i--) {
      msg[i] = counter2 & 255;
      counter2 = Math.floor(counter2 / 256);
    }
    const h = toUnsigned(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, toSigned(msg), toSigned(b32decode(secret2))));
    const o = h[h.length - 1] & 15;
    const code = ((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6;
    return String(code).padStart(6, "0");
  }
  function verifyTotp(secret2, code) {
    const c = String(code).replace(/\s/g, "");
    return /^\d{6}$/.test(c) && [-1, 0, 1].some((w) => safeEqual(totpCode(secret2, Date.now() + w * 3e4), c));
  }

  // google/src/db.ts
  var SCHEMAS = {
    Abonnes: ["id", "email", "first_name", "last_name", "status", "source", "tags", "subscribed_at", "confirmed_at", "unsubscribed_at", "bounce_count", "last_activity_at", "anonymized_at", "notes", "created_at"],
    Consentements: ["id", "subscriber_id", "action", "consent_text", "source", "user_agent", "created_at"],
    Jetons: ["id", "subscriber_id", "token_hash", "expires_at", "used_at", "created_at"],
    Exclusions: ["email_hash", "reason", "created_at"],
    Newsletters: ["id", "title", "design", "template_id", "created_at", "updated_at"],
    Modeles: ["id", "name", "description", "category", "is_system", "design", "created_at", "updated_at"],
    Segments: ["id", "name", "rules", "created_at"],
    Campagnes: ["id", "name", "subject", "preheader", "from_name", "from_email", "reply_to", "newsletter_id", "design", "audience", "status", "scheduled_at", "timezone", "started_at", "finished_at", "recipient_count", "track_opens", "created_at", "updated_at"],
    Destinataires: ["id", "campaign_id", "subscriber_id", "email", "status", "attempts", "message_id", "last_error", "sent_at", "updated_at"],
    Liens: ["id", "campaign_id", "url"],
    Evenements: ["id", "campaign_id", "recipient_id", "subscriber_id", "event_type", "link_id", "detail", "created_at"],
    Journal: ["id", "kind", "to_email", "subject", "campaign_id", "status", "message_id", "error", "created_at"],
    Medias: ["id", "file_id", "filename", "original_name", "url", "mime_type", "size_bytes", "width", "height", "alt_text", "created_at"],
    Comptes: ["id", "email", "display_name", "role", "password_hash", "totp_secret", "totp_enabled", "failed_logins", "locked_until", "last_login_at", "created_at"],
    Automatisations: ["key", "name", "description", "enabled", "config"],
    Executions: ["id", "automation_key", "status", "detail", "created_at"],
    Audit: ["id", "user_id", "action", "entity", "entity_id", "detail", "created_at"]
  };
  function encodeCell(v) {
    if (v === null || v === void 0) return "";
    if (typeof v === "string") return /^[=+\-@'"[{\d\s]|^(true|false|null)$|^$/.test(v) ? JSON.stringify(v) : v;
    return JSON.stringify(v);
  }
  function decodeCell(c) {
    if (c === "" || c === null || c === void 0) return null;
    if (typeof c !== "string") return c;
    if (/^["[{]/.test(c) || /^-?\d+(\.\d+)?$/.test(c) || /^(true|false|null)$/.test(c)) {
      try {
        return JSON.parse(c);
      } catch {
        return c;
      }
    }
    return c;
  }
  var MAX_CELL = 49e3;
  var Db = class {
    constructor(book) {
      __publicField(this, "book", book);
      __publicField(this, "cache", /* @__PURE__ */ new Map());
      __publicField(this, "dirty", /* @__PURE__ */ new Set());
    }
    sheet(name) {
      let sh = this.book.getSheetByName(name);
      if (!sh) {
        sh = this.book.insertSheet(name);
        const cols = SCHEMAS[name];
        sh.getRange(1, 1, 1, cols.length).setValues([cols]);
        sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat("@");
        sh.setFrozenRows(1);
      }
      return sh;
    }
    all(name) {
      if (this.cache.has(name)) return this.cache.get(name);
      const sh = this.sheet(name);
      const cols = SCHEMAS[name];
      const last = sh.getLastRow();
      const values = last > 1 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [];
      const rows = values.filter((r) => r.some((c) => c !== "" && c !== null)).map((r) => Object.fromEntries(cols.map((k, i) => [k, decodeCell(r[i])])));
      this.cache.set(name, rows);
      return rows;
    }
    set(name, rows) {
      this.cache.set(name, rows);
      this.dirty.add(name);
    }
    touch(name) {
      this.dirty.add(name);
    }
    insert(name, row) {
      const rows = this.all(name);
      if (SCHEMAS[name].includes("id") && row.id == null) row.id = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
      rows.push(row);
      this.dirty.add(name);
      return row;
    }
    find(name, id) {
      var _a;
      return (_a = this.all(name).find((r) => String(r.id) === String(id))) != null ? _a : null;
    }
    flush() {
      var _a;
      for (const name of this.dirty) {
        const sh = this.sheet(name);
        const cols = SCHEMAS[name];
        const rows = (_a = this.cache.get(name)) != null ? _a : [];
        const values = rows.map((r) => cols.map((k) => {
          const v = encodeCell(r[k]);
          if (v.length > MAX_CELL) throw Object.assign(new Error("Contenu trop volumineux pour être enregistré (limite Google Sheets)."), { status: 400 });
          return v;
        }));
        const last = sh.getLastRow();
        if (last > 1) sh.getRange(2, 1, last - 1, cols.length).clearContent();
        if (values.length) {
          if (sh.getMaxRows() < values.length + 1) sh.insertRowsAfter(sh.getMaxRows(), values.length + 1 - sh.getMaxRows());
          const range = sh.getRange(2, 1, values.length, cols.length);
          range.setNumberFormat("@");
          range.setValues(values);
        }
      }
      this.dirty.clear();
    }
  };
  function openBook() {
    const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  }

  // google/src/mail.ts
  function accountEmail() {
    var _a;
    return String((_a = Session.getEffectiveUser().getEmail()) != null ? _a : "");
  }
  function aliases() {
    var _a;
    try {
      return ((_a = GmailApp.getAliases()) != null ? _a : []).map((a) => a.toLowerCase());
    } catch {
      return [];
    }
  }
  function canSendAs(addr) {
    const a = addr.toLowerCase();
    return a === accountEmail().toLowerCase() || aliases().includes(a);
  }
  function gmailApiAvailable() {
    var _a;
    return typeof Gmail !== "undefined" && Boolean((_a = Gmail == null ? void 0 : Gmail.Users) == null ? void 0 : _a.Messages);
  }
  var b64 = (s) => Utilities.base64Encode(s, Utilities.Charset.UTF_8);
  var encodeWord = (s) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
  var wrap = (s) => s.replace(/(.{76})/g, "$1\r\n");
  function buildMime(m) {
    var _a;
    const boundary = `snl_${Utilities.getUuid().replace(/-/g, "")}`;
    const headers = [
      `From: ${encodeWord(m.fromName.replace(/["\r\n]/g, ""))} <${m.fromEmail}>`,
      `To: ${m.to}`,
      `Subject: ${encodeWord(m.subject.replace(/[\r\n]/g, " "))}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ...m.replyTo ? [`Reply-To: ${m.replyTo}`] : [],
      ...Object.entries((_a = m.headers) != null ? _a : {}).map(([k, v]) => `${k}: ${String(v).replace(/[\r\n]/g, " ")}`)
    ];
    return [
      ...headers,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrap(b64(m.text)),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrap(b64(m.html)),
      `--${boundary}--`,
      ""
    ].join("\r\n");
  }
  function classify(e) {
    var _a;
    const msg = String((_a = e == null ? void 0 : e.message) != null ? _a : e).slice(0, 500);
    if (/too many times|quota|limit exceeded|Limite/i.test(msg)) return { status: "quota", error: msg };
    if (/invalid (email|to)|adresse.*(invalide|non valide)|Invalid argument: (to|recipient)/i.test(msg)) return { status: "hard_bounce", error: msg };
    return { status: "soft_fail", error: msg };
  }
  function sendMail(db, m) {
    var _a, _b;
    let out;
    try {
      if (!canSendAs(m.fromEmail)) throw new Error(`L'adresse ${m.fromEmail} n'est pas configurée dans Gmail (« Envoyer des e-mails en tant que »).`);
      if (gmailApiAvailable()) {
        const raw = Utilities.base64EncodeWebSafe(buildMime(m), Utilities.Charset.UTF_8);
        const res = Gmail.Users.Messages.send({ raw }, "me");
        out = { status: "accepted", messageId: String((_a = res == null ? void 0 : res.id) != null ? _a : "") };
      } else {
        const opts = { htmlBody: m.html, name: m.fromName, replyTo: m.replyTo || void 0 };
        if (m.fromEmail.toLowerCase() !== accountEmail().toLowerCase()) opts.from = m.fromEmail;
        GmailApp.sendEmail(m.to, m.subject, m.text, opts);
        out = { status: "accepted", messageId: "" };
      }
    } catch (e) {
      out = classify(e);
    }
    db.insert("Journal", {
      kind: m.kind,
      to_email: m.to,
      subject: m.subject,
      campaign_id: (_b = m.campaignId) != null ? _b : null,
      status: out.status === "accepted" ? "accepted" : out.status === "hard_bounce" ? "bounced" : "failed",
      message_id: out.status === "accepted" ? out.messageId : null,
      error: out.status !== "accepted" ? out.error : null,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return out;
  }
  function sentToday(db) {
    const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    return db.all("Journal").filter((l) => l.status === "accepted" && String(l.created_at).startsWith(day)).length;
  }
  function googleQuota() {
    try {
      return MailApp.getRemainingDailyQuota();
    } catch {
      return null;
    }
  }

  // shared/src/blocks.ts
  var BRAND = {
    paper: "#f7f2e8",
    panel: "#fffdf8",
    ink: "#24201b",
    inkSoft: "#6b6155",
    line: "#ded3c0",
    accent: "#8c2230",
    accentSoft: "#f3e2e4",
    gold: "#b9863a",
    goldLight: "#d8b45c",
    sea: "#cddbe4",
    teal: "#3f7d68"
  };
  var DEFAULT_SETTINGS = {
    backgroundColor: BRAND.paper,
    contentBackground: BRAND.panel,
    textColor: BRAND.ink,
    linkColor: BRAND.accent,
    accentColor: BRAND.accent,
    fontFamily: "serif",
    width: 600
  };
  var BLOCK_LABELS = {
    heading: "Titre",
    subheading: "Sous-titre",
    text: "Texte",
    image: "Image",
    imageText: "Image avec texte",
    button: "Bouton",
    link: "Lien",
    divider: "Séparateur",
    spacer: "Espace vide",
    columns2: "Deux colonnes",
    columns3: "Trois colonnes",
    list: "Liste à puces",
    quote: "Citation",
    footer: "Pied de page"
  };
  var BLOCK_TYPES = Object.keys(BLOCK_LABELS);
  var counter = 0;
  function newBlockId() {
    counter += 1;
    return `b${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
  function defaultProps(type) {
    switch (type) {
      case "heading":
        return { text: "Titre de la lettre", align: "center", fontSize: 30, paddingTop: 24, paddingBottom: 8 };
      case "subheading":
        return { text: "Sous-titre", align: "left", fontSize: 21, paddingTop: 16, paddingBottom: 4 };
      case "text":
        return { text: "Bonjour {{prenom}},\n\nÉcrivez ici votre texte. Utilisez **gras**, *italique* et [un lien](https://sanctimaps.fr/).", align: "left", fontSize: 16, paddingTop: 8, paddingBottom: 8 };
      case "image":
        return { imageUrl: "", imageAlt: "", imageWidth: 100, align: "center", url: "", paddingTop: 8, paddingBottom: 8 };
      case "imageText":
        return { imageUrl: "", imageAlt: "", imagePosition: "left", text: "**Un titre court**\nUn paragraphe qui accompagne l'image.", fontSize: 15, paddingTop: 12, paddingBottom: 12 };
      case "button":
        return { label: "Découvrir sur SanctiMaps", url: "https://sanctimaps.fr/", align: "center", buttonColor: BRAND.accent, buttonTextColor: "#ffffff", buttonRadius: 6, fontSize: 16, paddingTop: 16, paddingBottom: 16 };
      case "link":
        return { label: "Lire la suite sur sanctimaps.fr →", url: "https://sanctimaps.fr/", align: "left", fontSize: 15, paddingTop: 4, paddingBottom: 4 };
      case "divider":
        return { lineColor: BRAND.line, paddingTop: 16, paddingBottom: 16 };
      case "spacer":
        return { height: 24 };
      case "columns2":
        return { paddingTop: 12, paddingBottom: 12, fontSize: 15, columns: [
          { title: "Première colonne", text: "Un court texte.", buttonLabel: "", buttonUrl: "" },
          { title: "Deuxième colonne", text: "Un court texte.", buttonLabel: "", buttonUrl: "" }
        ] };
      case "columns3":
        return { paddingTop: 12, paddingBottom: 12, fontSize: 14, columns: [
          { title: "Un", text: "Texte court." },
          { title: "Deux", text: "Texte court." },
          { title: "Trois", text: "Texte court." }
        ] };
      case "list":
        return { items: ["Premier point", "Deuxième point", "Troisième point"], fontSize: 16, paddingTop: 8, paddingBottom: 8 };
      case "quote":
        return { text: "Une citation inspirante.", author: "Auteur", fontSize: 18, align: "left", paddingTop: 12, paddingBottom: 12 };
      case "footer":
        return { text: "Vous recevez cette lettre car vous vous êtes inscrit(e) sur sanctimaps.fr.", align: "center", fontSize: 12, color: BRAND.inkSoft, paddingTop: 24, paddingBottom: 24 };
    }
  }
  function createBlock(type) {
    return { id: newBlockId(), type, props: defaultProps(type) };
  }

  // shared/src/render.ts
  var FONT_STACKS = {
    serif: "'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,'Times New Roman',serif",
    sans: "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
  };
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function safeColor(c, fallback) {
    if (!c) return fallback;
    return /^#[0-9a-fA-F]{3,8}$/.test(c.trim()) ? c.trim() : fallback;
  }
  function safeUrl(u) {
    if (!u) return "";
    const t = u.trim();
    if (/^https?:\/\//i.test(t) || /^mailto:/i.test(t)) return t;
    return "";
  }
  function num(n, def, min = 0, max = 200) {
    const v = typeof n === "number" && Number.isFinite(n) ? n : def;
    return Math.min(max, Math.max(min, Math.round(v)));
  }
  function applyVariables(text, ctx) {
    var _a;
    const first = ctx.sampleData ? "Marie" : ((_a = ctx.firstName) != null ? _a : "").trim();
    return text.replace(/\{\{\s*prenom\s*(?:\|\s*([^}]*))?\}\}/gi, (_m, fb) => first || (fb != null ? fb : "").trim()).replace(/ +([,.;!?])/g, (_m, p) => p === "," || p === "." ? p : ` ${p}`);
  }
  function inlineMarkup(raw, linkColor, track) {
    let s = escapeHtml(raw);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
      const decoded = url.replace(/&amp;/g, "&");
      const safe = safeUrl(decoded);
      if (!safe) return label;
      const href = track && !safe.startsWith("mailto:") ? track(safe) : safe;
      return `<a href="${escapeHtml(href)}" style="color:${linkColor};text-decoration:underline;" target="_blank">${label}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    return s;
  }
  function paragraphs(raw, style, linkColor, track) {
    return raw.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px 0;${style}">${inlineMarkup(p, linkColor, track).replace(/\n/g, "<br>")}</p>`).join("");
  }
  function stripMarkup(raw) {
    return raw.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1");
  }
  function wrapRow(inner, b2, s, extraTd = "") {
    const p = b2.props;
    const bg = p.backgroundColor ? `background-color:${safeColor(p.backgroundColor, s.contentBackground)};` : "";
    return `<tr><td class="px" style="padding:${num(p.paddingTop, 8)}px 32px ${num(p.paddingBottom, 8)}px 32px;${bg}${extraTd}">${inner}</td></tr>`;
  }
  function buttonHtml(label, url, color, textColor, radius, fontSize, font, align, track) {
    const safe = safeUrl(url);
    const href = safe ? escapeHtml(track && !safe.startsWith("mailto:") ? track(safe) : safe) : "#";
    return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="${align}" style="margin:0 ${align === "center" ? "auto" : "0"};"><tr>
<td align="center" bgcolor="${color}" style="border-radius:${radius}px;background-color:${color};">
<a href="${href}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${font};font-size:${fontSize}px;font-weight:bold;line-height:1.2;color:${textColor};text-decoration:none;border-radius:${radius}px;">${escapeHtml(label)}</a>
</td></tr></table>`;
  }
  function imageHtml(url, alt, width, s, link, track) {
    const src = safeUrl(url);
    if (!src) {
      return `<div style="padding:28px;border:1px dashed ${BRAND.line};color:${BRAND.inkSoft};font-family:${FONT_STACKS.sans};font-size:13px;text-align:center;">Image à choisir</div>`;
    }
    const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;font-family:${FONT_STACKS.sans};font-size:14px;color:${s.textColor};background-color:${BRAND.sea};">`;
    const l = safeUrl(link);
    if (!l) return img;
    return `<a href="${escapeHtml(track ? track(l) : l)}" target="_blank">${img}</a>`;
  }
  function columnCell(c, widthPx, s, font, fontSize, track) {
    var _a;
    const parts = [];
    if (c.imageUrl) parts.push(`<div style="margin-bottom:10px;">${imageHtml(c.imageUrl, (_a = c.imageAlt) != null ? _a : "", widthPx, s, void 0, track)}</div>`);
    if (c.title) parts.push(`<p style="margin:0 0 6px 0;font-family:${font};font-size:${fontSize + 3}px;font-weight:bold;color:${s.textColor};">${inlineMarkup(c.title, s.linkColor, track)}</p>`);
    if (c.text) parts.push(paragraphs(c.text, `font-family:${font};font-size:${fontSize}px;line-height:1.55;color:${s.textColor};`, s.linkColor, track));
    if (c.buttonLabel && c.buttonUrl) parts.push(buttonHtml(c.buttonLabel, c.buttonUrl, s.accentColor, "#ffffff", 6, 14, font, "left", track));
    return parts.join("");
  }
  function renderBlock(b2, s, ctx) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    const p = b2.props;
    const font = (_a = FONT_STACKS[s.fontFamily]) != null ? _a : FONT_STACKS.serif;
    const color = safeColor(p.color, s.textColor);
    const align = (_b = p.align) != null ? _b : "left";
    const track = ctx.trackLink;
    const inner = s.width - 64;
    const vars = (t) => applyVariables(t != null ? t : "", ctx);
    switch (b2.type) {
      case "heading":
        return wrapRow(`<h1 style="margin:0;font-family:${font};font-size:${num(p.fontSize, 30, 12, 60)}px;line-height:1.2;font-weight:bold;color:${color};text-align:${align};">${inlineMarkup(vars(p.text), s.linkColor, track)}</h1>`, b2, s);
      case "subheading":
        return wrapRow(`<h2 style="margin:0;font-family:${font};font-size:${num(p.fontSize, 21, 12, 48)}px;line-height:1.3;font-weight:bold;color:${safeColor(p.color, s.accentColor)};text-align:${align};">${inlineMarkup(vars(p.text), s.linkColor, track)}</h2>`, b2, s);
      case "text":
        return wrapRow(paragraphs(vars(p.text), `font-family:${font};font-size:${num(p.fontSize, 16, 10, 32)}px;line-height:1.65;color:${color};text-align:${align};`, s.linkColor, track), b2, s);
      case "image": {
        const w = Math.round(inner * num(p.imageWidth, 100, 10, 100) / 100);
        return wrapRow(`<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="${align}" width="${w}" style="margin:0 ${align === "center" ? "auto" : "0"};width:${w}px;max-width:100%;"><tr><td>${imageHtml((_c = p.imageUrl) != null ? _c : "", (_d = p.imageAlt) != null ? _d : "", w, s, p.url, track)}</td></tr></table>`, b2, s);
      }
      case "imageText": {
        const imgW = Math.round(inner * 0.4);
        const txtW = inner - imgW - 20;
        const imgCell = `<td class="stack" width="${imgW}" valign="top" style="width:${imgW}px;">${imageHtml((_e = p.imageUrl) != null ? _e : "", (_f = p.imageAlt) != null ? _f : "", imgW, s, p.url, track)}</td>`;
        const gap = `<td class="stack-gap" width="20" style="width:20px;font-size:0;line-height:0;">&nbsp;</td>`;
        const txtCell = `<td class="stack" width="${txtW}" valign="top" style="width:${txtW}px;">${paragraphs(vars(p.text), `font-family:${font};font-size:${num(p.fontSize, 15, 10, 28)}px;line-height:1.6;color:${color};`, s.linkColor, track)}</td>`;
        const cells = p.imagePosition === "right" ? txtCell + gap + imgCell : imgCell + gap + txtCell;
        return wrapRow(`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`, b2, s);
      }
      case "button":
        return wrapRow(buttonHtml((_g = p.label) != null ? _g : "Bouton", (_h = p.url) != null ? _h : "", safeColor(p.buttonColor, s.accentColor), safeColor(p.buttonTextColor, "#ffffff"), num(p.buttonRadius, 6, 0, 40), num(p.fontSize, 16, 10, 28), font, align, track), b2, s, `text-align:${align};`);
      case "link": {
        const u = safeUrl(p.url);
        const href = u ? escapeHtml(track && !u.startsWith("mailto:") ? track(u) : u) : "#";
        return wrapRow(`<p style="margin:0;font-family:${font};font-size:${num(p.fontSize, 15)}px;text-align:${align};"><a href="${href}" target="_blank" style="color:${safeColor(p.color, s.linkColor)};text-decoration:underline;">${escapeHtml((_j = (_i = p.label) != null ? _i : p.url) != null ? _j : "")}</a></p>`, b2, s);
      }
      case "divider":
        return wrapRow(`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid ${safeColor(p.lineColor, BRAND.line)};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`, b2, s);
      case "spacer":
        return `<tr><td style="height:${num(p.height, 24, 4, 160)}px;font-size:0;line-height:0;${p.backgroundColor ? `background-color:${safeColor(p.backgroundColor, s.contentBackground)};` : ""}">&nbsp;</td></tr>`;
      case "columns2":
      case "columns3": {
        const n = b2.type === "columns2" ? 2 : 3;
        const cols = ((_k = p.columns) != null ? _k : []).slice(0, n);
        while (cols.length < n) cols.push({});
        const gap = 20;
        const w = Math.floor((inner - gap * (n - 1)) / n);
        const cells = cols.map((c, i) => `${i ? `<td class="stack-gap" width="${gap}" style="width:${gap}px;font-size:0;line-height:0;">&nbsp;</td>` : ""}<td class="stack" width="${w}" valign="top" style="width:${w}px;">${columnCell({ ...c, title: vars(c.title), text: vars(c.text) }, w, s, font, num(p.fontSize, 15, 10, 24), track)}</td>`).join("");
        return wrapRow(`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`, b2, s);
      }
      case "list": {
        const items = ((_l = p.items) != null ? _l : []).filter((x) => x.trim());
        const lis = items.map((it) => `<tr><td width="22" valign="top" style="width:22px;font-family:${font};font-size:${num(p.fontSize, 16)}px;line-height:1.6;color:${s.accentColor};">&#8226;</td><td valign="top" style="font-family:${font};font-size:${num(p.fontSize, 16)}px;line-height:1.6;color:${color};padding-bottom:4px;">${inlineMarkup(vars(it), s.linkColor, track)}</td></tr>`).join("");
        return wrapRow(`<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${lis}</table>`, b2, s);
      }
      case "quote":
        return wrapRow(`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${BRAND.gold};padding:4px 0 4px 18px;">
<p style="margin:0;font-family:${FONT_STACKS.serif};font-size:${num(p.fontSize, 18)}px;line-height:1.55;font-style:italic;color:${color};text-align:${align};">« ${inlineMarkup(vars(p.text), s.linkColor, track)} »</p>
${p.author ? `<p style="margin:8px 0 0 0;font-family:${font};font-size:14px;color:${BRAND.inkSoft};text-align:${align};">— ${escapeHtml(p.author)}</p>` : ""}</td></tr></table>`, b2, s);
      case "footer":
        return footerRow(b2, s, ctx);
    }
  }
  function footerRow(b2, s, ctx) {
    var _a;
    const p = (_a = b2 == null ? void 0 : b2.props) != null ? _a : {};
    const color = safeColor(p.color, BRAND.inkSoft);
    const fs = num(p.fontSize, 12, 10, 16);
    const sans = FONT_STACKS.sans;
    const custom = p.text ? paragraphs(applyVariables(p.text, ctx), `font-family:${sans};font-size:${fs}px;line-height:1.5;color:${color};text-align:center;`, color) : "";
    return `<tr><td class="px" style="padding:${num(p.paddingTop, 24)}px 32px ${num(p.paddingBottom, 24)}px 32px;border-top:1px solid ${BRAND.line};${p.backgroundColor ? `background-color:${safeColor(p.backgroundColor, s.contentBackground)};` : ""}">
${custom}
<p style="margin:0 0 8px 0;font-family:${sans};font-size:${fs}px;line-height:1.5;color:${color};text-align:center;">${escapeHtml(ctx.legalText)}</p>
<p style="margin:0;font-family:${sans};font-size:${fs}px;line-height:1.5;color:${color};text-align:center;">
<a href="${escapeHtml(ctx.unsubscribeUrl)}" target="_blank" style="color:${color};text-decoration:underline;">Se désinscrire</a> &nbsp;·&nbsp;
<a href="${escapeHtml(ctx.privacyUrl)}" target="_blank" style="color:${color};text-decoration:underline;">Confidentialité</a></p>
</td></tr>`;
  }
  function blockText(b2, ctx) {
    var _a, _b, _c;
    const p = b2.props;
    const v = (t) => stripMarkup(applyVariables(t != null ? t : "", ctx));
    switch (b2.type) {
      case "heading":
        return v(p.text).toUpperCase();
      case "subheading":
        return v(p.text);
      case "text":
      case "imageText":
        return v(p.text);
      case "image":
        return p.imageAlt ? `[Image : ${p.imageAlt}]` : "";
      case "button":
      case "link":
        return `${(_a = p.label) != null ? _a : ""} : ${safeUrl(p.url)}`;
      case "divider":
        return "----------";
      case "spacer":
        return "";
      case "columns2":
      case "columns3":
        return ((_b = p.columns) != null ? _b : []).map((c) => [v(c.title), v(c.text), c.buttonUrl ? `${c.buttonLabel} : ${safeUrl(c.buttonUrl)}` : ""].filter(Boolean).join("\n")).join("\n\n");
      case "list":
        return ((_c = p.items) != null ? _c : []).map((i) => `• ${v(i)}`).join("\n");
      case "quote":
        return `« ${v(p.text)} »${p.author ? `
— ${p.author}` : ""}`;
      case "footer":
        return v(p.text);
    }
  }
  function renderEmail(design, ctx) {
    var _a, _b, _c, _d, _e;
    const s = { ...DEFAULT_SETTINGS, ...(_a = design.settings) != null ? _a : {} };
    s.backgroundColor = safeColor(s.backgroundColor, DEFAULT_SETTINGS.backgroundColor);
    s.contentBackground = safeColor(s.contentBackground, DEFAULT_SETTINGS.contentBackground);
    s.textColor = safeColor(s.textColor, DEFAULT_SETTINGS.textColor);
    s.linkColor = safeColor(s.linkColor, DEFAULT_SETTINGS.linkColor);
    s.accentColor = safeColor(s.accentColor, DEFAULT_SETTINGS.accentColor);
    s.width = num(s.width, 600, 480, 720);
    const blocks = (_b = design.blocks) != null ? _b : [];
    const footer2 = (_c = blocks.find((b2) => b2.type === "footer")) != null ? _c : null;
    const body = blocks.filter((b2) => b2.type !== "footer").map((b2) => renderBlock(b2, s, ctx)).join("\n");
    const foot = footerRow(footer2, s, ctx);
    const preheader = escapeHtml((_e = (_d = ctx.preheader) != null ? _d : s.preheader) != null ? _e : "");
    const pixel = ctx.openPixelUrl ? `<img src="${escapeHtml(ctx.openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">` : "";
    const html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(ctx.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{-ms-interpolation-mode:bicubic;}
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
  @media screen and (max-width:${s.width + 20}px){
    .container{width:100%!important;}
    .px{padding-left:20px!important;padding-right:20px!important;}
    .stack{display:block!important;width:100%!important;padding-bottom:16px!important;}
    .stack-gap{display:none!important;}
    .stack img{max-width:100%!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${s.backgroundColor};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${s.backgroundColor};">${preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${s.backgroundColor}" style="background-color:${s.backgroundColor};">
<tr><td align="center" style="padding:24px 8px;">
<!--[if mso]><table role="presentation" width="${s.width}" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="container" width="${s.width}" border="0" cellpadding="0" cellspacing="0" style="width:${s.width}px;max-width:100%;background-color:${s.contentBackground};border:1px solid ${BRAND.line};border-radius:10px;">
${body}
${foot}
</table>
<!--[if mso]></td></tr></table><![endif]-->
${pixel}
</td></tr></table>
</body>
</html>`;
    const textParts = blocks.filter((b2) => b2.type !== "footer").map((b2) => blockText(b2, ctx)).filter((t) => t.trim());
    const footText = footer2 ? blockText(footer2, ctx) : "";
    const text = `${textParts.join("\n\n")}

--
${footText ? `${footText}
` : ""}${ctx.legalText}
Se désinscrire : ${ctx.unsubscribeUrl}
Confidentialité : ${ctx.privacyUrl}
`;
    return { html, text };
  }
  function collectLinks(design) {
    var _a, _b, _c;
    const urls = /* @__PURE__ */ new Set();
    const scan = (t) => {
      if (!t) return;
      for (const m of t.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
        const u = safeUrl(m[1]);
        if (u && !u.startsWith("mailto:")) urls.add(u);
      }
    };
    for (const b2 of (_a = design.blocks) != null ? _a : []) {
      const p = b2.props;
      scan(p.text);
      ((_b = p.items) != null ? _b : []).forEach(scan);
      for (const u of [p.url]) {
        const s = safeUrl(u);
        if (s && !s.startsWith("mailto:")) urls.add(s);
      }
      for (const c of (_c = p.columns) != null ? _c : []) {
        scan(c.text);
        scan(c.title);
        const s = safeUrl(c.buttonUrl);
        if (s && !s.startsWith("mailto:")) urls.add(s);
      }
    }
    return [...urls];
  }

  // shared/src/templates.ts
  var LOGO = "https://sanctimaps.fr/icons/icon-192.png";
  function b(type, props2 = {}) {
    const blk = createBlock(type);
    blk.props = { ...blk.props, ...props2 };
    return blk;
  }
  var logo = () => b("image", { imageUrl: LOGO, imageAlt: "SanctiMaps", imageWidth: 18, align: "center", url: "https://sanctimaps.fr/", paddingTop: 28, paddingBottom: 4 });
  var footer = () => b("footer", { text: "Vous recevez la lettre de SanctiMaps car vous vous y êtes inscrit(e) sur sanctimaps.fr." });
  function starterTemplates() {
    return [
      {
        name: "Newsletter classique",
        category: "classique",
        description: "Logo, titre, texte d'introduction, bouton et pied de page.",
        design: { settings: { ...DEFAULT_SETTINGS }, blocks: [
          logo(),
          b("heading", { text: "La lettre de SanctiMaps" }),
          b("text", { text: "Bonjour {{prenom}},\n\nVoici les nouveautés de la carte mondiale des saints.", align: "left" }),
          b("divider"),
          b("subheading", { text: "À la une" }),
          b("text", { text: "Présentez ici le sujet principal de la lettre." }),
          b("button", { label: "Ouvrir la carte", url: "https://sanctimaps.fr/" }),
          footer()
        ] }
      },
      {
        name: "Newsletter éditoriale",
        category: "editoriale",
        description: "Long texte de réflexion avec citation, idéale pour le saint du jour.",
        design: { settings: { ...DEFAULT_SETTINGS }, blocks: [
          logo(),
          b("subheading", { text: "Le saint du jour", align: "center", color: BRAND.gold, fontSize: 15 }),
          b("heading", { text: "Saint Vincent de Paul, l'apôtre de la charité", fontSize: 28 }),
          b("divider", { lineColor: BRAND.goldLight }),
          b("text", { text: "Bonjour {{prenom}},\n\nAujourd'hui nous fêtons **saint Vincent de Paul**. Racontez ici son histoire, les lieux de sa vie et ce qu'il peut nous dire aujourd'hui." }),
          b("quote", { text: "La charité est inventive jusqu'à l'infini.", author: "Saint Vincent de Paul" }),
          b("text", { text: "Poursuivez votre texte ici." }),
          b("link", { label: "Voir sa fiche sur SanctiMaps →", url: "https://sanctimaps.fr/saints/" }),
          footer()
        ] }
      },
      {
        name: "Newsletter avec image principale",
        category: "image",
        description: "Grande image en tête, titre, texte et bouton.",
        design: { settings: { ...DEFAULT_SETTINGS }, blocks: [
          b("image", { imageUrl: "", imageAlt: "Image principale", imageWidth: 100, paddingTop: 0, paddingBottom: 0 }),
          b("heading", { text: "Un titre fort pour votre image", paddingTop: 28 }),
          b("text", { text: "Bonjour {{prenom}},\n\nUn texte court qui accompagne l'image principale.", align: "center" }),
          b("button", { label: "En savoir plus", url: "https://sanctimaps.fr/" }),
          footer()
        ] }
      },
      {
        name: "Newsletter avec plusieurs actualités",
        category: "actualites",
        description: "Une actualité principale puis plusieurs brèves en colonnes.",
        design: { settings: { ...DEFAULT_SETTINGS }, blocks: [
          logo(),
          b("heading", { text: "Les actualités du mois" }),
          b("text", { text: "Bonjour {{prenom}}, voici ce qui a changé sur SanctiMaps.", align: "center" }),
          b("imageText", { text: "**Nouveaux lieux sur la carte**\nDécrivez la première actualité en quelques lignes. [Lire la suite](https://sanctimaps.fr/lieux/)" }),
          b("divider"),
          b("columns2", { columns: [
            { title: "Calendrier", text: "Les fêtes du mois à venir.", buttonLabel: "Voir", buttonUrl: "https://sanctimaps.fr/calendrier/" },
            { title: "Époques", text: "Parcourir les saints par siècle.", buttonLabel: "Voir", buttonUrl: "https://sanctimaps.fr/epoques/" }
          ] }),
          b("columns3", { columns: [
            { title: "Pays", text: "Les saints de chaque pays." },
            { title: "Lieux", text: "Sanctuaires et pèlerinages." },
            { title: "Saints", text: "L'index complet." }
          ] }),
          footer()
        ] }
      },
      {
        name: "Newsletter promotionnelle",
        category: "promotion",
        description: "Annonce d'un événement ou d'une nouveauté, avec liste d'arguments et appel à l'action.",
        design: { settings: { ...DEFAULT_SETTINGS, contentBackground: "#ffffff" }, blocks: [
          logo(),
          b("subheading", { text: "Nouveau", align: "center", color: BRAND.accent, fontSize: 14 }),
          b("heading", { text: "Annoncez votre nouveauté" }),
          b("text", { text: "Bonjour {{prenom}},\n\nPrésentez en une phrase ce que vous proposez.", align: "center" }),
          b("list", { items: ["Premier avantage", "Deuxième avantage", "Troisième avantage"] }),
          b("button", { label: "Je découvre", url: "https://sanctimaps.fr/", buttonColor: BRAND.accent }),
          b("spacer", { height: 12 }),
          footer()
        ] }
      },
      {
        name: "Newsletter minimaliste",
        category: "minimaliste",
        description: "Uniquement du texte, sobre et personnel.",
        design: { settings: { ...DEFAULT_SETTINGS, backgroundColor: "#ffffff", contentBackground: "#ffffff" }, blocks: [
          b("text", { text: "Bonjour {{prenom}},\n\nÉcrivez votre message ici, comme une lettre personnelle.\n\nBien fidèlement,\nL'équipe SanctiMaps", paddingTop: 32 }),
          footer()
        ] }
      }
    ];
  }

  // database/seeds/politique-confidentialite.md
  var politique_confidentialite_default = "# Politique de confidentialité — La lettre de SanctiMaps\n\n*Brouillon à relire et compléter avant la mise en production (Paramètres → Confidentialité).*\n\n## Responsable du traitement\n\nSanctiMaps — https://sanctimaps.fr/\nContact : **[adresse de contact à compléter]**\n\n## Finalité\n\nVos données servent uniquement à vous envoyer la lettre d'information de SanctiMaps (saint du jour, nouveaux lieux et saints ajoutés à la carte, nouveautés du site). Elles ne sont jamais vendues, louées ni utilisées pour une autre finalité.\n\n## Base légale\n\nVotre **consentement** (article 6.1.a du RGPD), recueilli par une case à cocher puis confirmé par un clic dans un e-mail (double opt-in).\n\n## Données collectées\n\n- Adresse e-mail (obligatoire) ;\n- Prénom (facultatif) ;\n- Preuve du consentement : date, texte accepté, origine de l'inscription, adresse IP tronquée, navigateur ;\n- Événements liés aux envois : acceptation par le serveur, erreurs de livraison, clics sur les liens (pour mesurer l'intérêt des contenus). La mesure d'ouverture est désactivée par défaut.\n\n## Durée de conservation\n\n- Inscriptions non confirmées : supprimées automatiquement après **30 jours** ;\n- Abonnés : tant que vous restez inscrit(e) ;\n- Après désinscription : seule une empreinte chiffrée de l'adresse est conservée, pour ne plus jamais vous écrire par erreur ; les preuves de consentement sont conservées **3 ans** pour répondre à un éventuel contrôle.\n\n## Destinataires et hébergement\n\nLes données sont enregistrées dans un tableur privé **Google Sheets** du responsable du traitement ; les e-mails sont envoyés par **Gmail** avec l'adresse d'expédition de SanctiMaps, via le serveur de messagerie **IONOS**. Google et IONOS agissent comme sous-traitants. Le site du studio est hébergé par **GitHub Pages**, qui ne reçoit aucune donnée d'abonné.\n\n## Vos droits\n\nVous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition, de limitation et de portabilité. Pour les exercer, écrivez à **[adresse de contact]**. Vous pouvez vous désinscrire à tout moment grâce au lien présent en bas de chaque lettre.\n\nVous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr).\n";

  // google/src/settings.ts
  var props = () => PropertiesService.getScriptProperties();
  var DEFAULT_SETTINGS2 = {
    sender: { fromName: "SanctiMaps", fromEmail: "newsletter@sanctimaps.fr", replyTo: "" },
    organization: { name: "SanctiMaps", legalText: "SanctiMaps — la carte mondiale des saints · sanctimaps.fr", contactEmail: "", website: "https://sanctimaps.fr/" },
    // Gmail gratuit via Apps Script : environ 100 destinataires par jour (quota Google).
    sending: { batchSize: 20, batchDelayMs: 0, maxPerHour: 100, maxAttempts: 3, maxPerDay: 100 },
    tracking: { clicks: true, opens: false },
    dkimSelector: "",
    smtpCheck: { ok: false, checkedAt: null, message: "Jamais vérifié" },
    domainCheck: { checkedAt: null, spf: false, dkim: false, dmarc: false, details: {} },
    testEmail: { sentAt: null, to: null },
    realSendingEnabled: false,
    privacyPolicy: { markdown: "", reviewed: false },
    retention: { unconfirmedDays: 30, logsMonths: 24 },
    timezone: "Europe/Paris"
  };
  function getSettings() {
    const raw = props().getProperty("SETTINGS");
    const saved = raw ? JSON.parse(raw) : {};
    const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS2));
    for (const [k, v] of Object.entries(saved)) out[k] = out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) ? { ...out[k], ...v } : v;
    if (!out.privacyPolicy.markdown) out.privacyPolicy.markdown = politique_confidentialite_default;
    return out;
  }
  function saveSettings(s) {
    props().setProperty("SETTINGS", JSON.stringify(s));
  }
  var siteUrl = () => {
    var _a;
    return ((_a = props().getProperty("SITE_URL")) != null ? _a : "https://sanctimaps-gif.github.io/Newslatter/").replace(/\/?$/, "/");
  };
  var scriptUrl = () => {
    var _a;
    return (_a = props().getProperty("SCRIPT_URL")) != null ? _a : (() => {
      try {
        return ScriptApp.getService().getUrl();
      } catch {
        return "";
      }
    })();
  };

  // google/src/templates.ts
  function transactional(db, to, subject, specs, kind, subscriberId) {
    const s = getSettings();
    const logo2 = createBlock("image");
    logo2.props = { ...logo2.props, imageUrl: "https://sanctimaps.fr/icons/icon-192.png", imageAlt: "SanctiMaps", imageWidth: 16, align: "center", paddingTop: 28 };
    const blocks = [logo2, ...specs.map(([type, props2]) => {
      const b2 = createBlock(type);
      b2.props = { ...b2.props, ...props2 };
      return b2;
    })];
    const unsub = subscriberId ? `${siteUrl()}#/desinscription` : `${siteUrl()}#/desinscription`;
    const r = renderEmail({ settings: { ...DEFAULT_SETTINGS }, blocks }, { subject, firstName: null, unsubscribeUrl: unsub, privacyUrl: `${siteUrl()}#/confidentialite`, legalText: s.organization.legalText });
    return sendMail(db, { to, subject, html: r.html, text: r.text, fromName: s.sender.fromName, fromEmail: s.sender.fromEmail, replyTo: s.sender.replyTo || void 0, kind });
  }

  // google/src/router.ts
  var HttpError = class extends Error {
    constructor(status, message) {
      super(message);
      __publicField(this, "status", status);
    }
  };
  var fail = (status, msg) => {
    throw new HttpError(status, msg);
  };
  var now = () => (/* @__PURE__ */ new Date()).toISOString();
  var isEmail = (v) => typeof v === "string" && v.length <= 254 && /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/.test(v);
  var cleanName = (v) => {
    const s = String(v != null ? v : "").trim().slice(0, 80);
    if (/[<>{}\\]/.test(s)) fail(400, "Caractères non autorisés.");
    return s || null;
  };
  var clone = (v) => JSON.parse(JSON.stringify(v));
  var CONSENT_TEXT = "J'accepte de recevoir la lettre d'information de SanctiMaps (actualités de la carte des saints, saint du jour, nouveautés du site). Je peux me désinscrire à tout moment grâce au lien présent dans chaque e-mail.";
  var PURPOSE = "Recevoir la lettre d'information de SanctiMaps : le saint du jour, les nouveaux lieux et saints ajoutés à la carte et les nouveautés du site. Environ une lettre par semaine.";
  var ROLE_RANK = { viewer: 1, editor: 2, admin: 3 };
  var DEFAULT_AUTOMATIONS = [
    { key: "welcome_email", name: "E-mail de bienvenue", description: "Envoie un message de bienvenue juste après la confirmation de l'inscription (message transactionnel, non publicitaire).", enabled: false, config: { subject: "Bienvenue dans la lettre de SanctiMaps", body: "Merci d'avoir confirmé votre inscription. Vous recevrez désormais la lettre de SanctiMaps : un saint, un lieu, une histoire." } },
    { key: "admin_signup_notification", name: "Notification d'inscription", description: "Prévient l'administrateur par e-mail à chaque nouvelle inscription confirmée.", enabled: false, config: { to: "" } },
    { key: "editorial_reminder", name: "Relance éditoriale", description: "Rappelle à l'administrateur de préparer la prochaine lettre si aucune campagne n'est programmée ou envoyée depuis N jours.", enabled: false, config: { days: 7, to: "" } },
    { key: "inactive_subscribers", name: "Abonnés inactifs", description: "Signale (sans les supprimer) les abonnés confirmés sans aucun clic depuis N mois.", enabled: false, config: { months: 12 } },
    { key: "purge_unconfirmed", name: "Purge des inscriptions non confirmées", description: "Supprime les inscriptions restées non confirmées après N jours (minimisation des données, RGPD).", enabled: true, config: { days: 30 } }
  ];
  var secret = () => {
    var _a;
    return (_a = props().getProperty("SECRET")) != null ? _a : fail(500, "Script non installé : exécutez la fonction « installer ».");
  };
  var emailHash = (e) => hmac(`email:${e.trim().toLowerCase()}`, secret());
  var unsubscribeToken = (id) => `${id.toString(36)}.${hmac(`unsub:${id}`, secret()).slice(0, 32)}`;
  function readUnsubscribeToken(t) {
    const [a, sig] = String(t != null ? t : "").split(".");
    const id = parseInt(a, 36);
    return id > 0 && sig && safeEqual(hmac(`unsub:${id}`, secret()).slice(0, 32), sig) ? id : null;
  }
  var recipientToken = (id) => `${id.toString(36)}.${hmac(`rcpt:${id}`, secret()).slice(0, 16)}`;
  function readRecipientToken(t) {
    const [a, sig] = String(t != null ? t : "").split(".");
    const id = parseInt(a, 36);
    return id > 0 && sig && safeEqual(hmac(`rcpt:${id}`, secret()).slice(0, 16), sig) ? id : null;
  }
  var unsubscribeUrl = (id) => `${siteUrl()}#/desinscription?t=${encodeURIComponent(unsubscribeToken(id))}`;
  var oneClickUrl = (id) => `${scriptUrl()}?action=unsubscribe&t=${encodeURIComponent(unsubscribeToken(id))}`;
  var cache = () => CacheService.getScriptCache();
  function sessionOf(token) {
    if (!token || token.length > 100) return null;
    const raw = cache().get(`sess_${sha256(token)}`);
    return raw ? JSON.parse(raw) : null;
  }
  function openSession(userId, pending2fa) {
    const t = randomToken();
    cache().put(`sess_${sha256(t)}`, JSON.stringify({ uid: userId, pending2fa }), pending2fa ? 600 : 21600);
    return t;
  }
  function authenticate(db, token) {
    const s = sessionOf(token);
    if (!s || s.pending2fa) return null;
    return db.find("Comptes", s.uid);
  }
  var publicUser = (u) => ({ id: u.id, email: u.email, displayName: u.display_name, role: u.role, totpEnabled: Boolean(u.totp_enabled) });
  function audit(c, action, entity, entityId, detail) {
    var _a, _b;
    c.db.insert("Audit", { user_id: (_b = (_a = c.user) == null ? void 0 : _a.id) != null ? _b : null, action, entity: entity != null ? entity : null, entity_id: entityId != null ? String(entityId) : null, detail: detail != null ? detail : null, created_at: now() });
  }
  function need(c, role) {
    if (!c.user) fail(401, "Authentification requise.");
    if (ROLE_RANK[c.user.role] < ROLE_RANK[role]) fail(403, "Droits insuffisants.");
  }
  function passwordOk(p) {
    const s = String(p != null ? p : "");
    if (s.length < 12 || s.length > 200) fail(400, "Le mot de passe doit contenir au moins 12 caractères.");
    if (!/[a-z]/i.test(s) || !/\d/.test(s)) fail(400, "Le mot de passe doit contenir des lettres et des chiffres.");
    return s;
  }
  var suppressed = (db, email) => {
    var _a, _b;
    return (_b = (_a = db.all("Exclusions").find((x) => x.email_hash === emailHash(email))) == null ? void 0 : _a.reason) != null ? _b : null;
  };
  function addSuppression(db, email, reason) {
    const h = emailHash(email);
    const row = db.all("Exclusions").find((x) => x.email_hash === h);
    if (row) {
      if (!["complaint", "erasure"].includes(row.reason)) row.reason = reason;
      db.touch("Exclusions");
    } else db.insert("Exclusions", { email_hash: h, reason, created_at: now() });
  }
  function newConfirmationToken(db, subscriberId) {
    for (const t of db.all("Jetons")) if (t.subscriber_id === subscriberId && !t.used_at) t.used_at = now();
    const token = randomToken();
    db.insert("Jetons", { subscriber_id: subscriberId, token_hash: sha256(token), expires_at: new Date(Date.now() + 48 * 36e5).toISOString(), used_at: null, created_at: now() });
    return token;
  }
  function sendConfirmation(db, sub, token) {
    const url = `${siteUrl()}#/confirmation?t=${encodeURIComponent(token)}`;
    return transactional(db, sub.email, "Confirmez votre inscription à la lettre de SanctiMaps", [
      ["heading", { text: "Encore une étape", fontSize: 26 }],
      ["text", { text: `Bonjour${sub.first_name ? " " + sub.first_name : ""},

Vous avez demandé à recevoir la lettre de SanctiMaps. Pour confirmer votre inscription, cliquez sur le bouton ci-dessous. Ce lien est valable 48 heures.`, align: "center" }],
      ["button", { label: "Je confirme mon inscription", url }],
      ["text", { text: `Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
${url}

Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement ce message : vous ne recevrez rien.`, fontSize: 13, align: "center", color: "#6b6155" }]
    ], "confirmation", sub.id);
  }
  function onConfirmed(db, sub) {
    var _a;
    const autos = db.all("Automatisations");
    const welcome = autos.find((a) => a.key === "welcome_email" && a.enabled);
    if (welcome) {
      const r = transactional(db, sub.email, String(welcome.config.subject || "Bienvenue"), [
        ["heading", { text: String(welcome.config.subject || "Bienvenue") }],
        ["text", { text: `Bonjour${sub.first_name ? " " + sub.first_name : ""},

${welcome.config.body}` }],
        ["button", { label: "Explorer la carte des saints", url: "https://sanctimaps.fr/" }]
      ], "welcome", sub.id);
      db.insert("Executions", { automation_key: "welcome_email", status: r.status === "accepted" ? "ok" : "error", detail: { subscriberId: sub.id }, created_at: now() });
    }
    const notif = autos.find((a) => a.key === "admin_signup_notification" && a.enabled);
    if (notif) {
      const to = String(notif.config.to || "") || ((_a = db.all("Comptes").find((u) => u.role === "admin")) == null ? void 0 : _a.email);
      if (to) {
        const r = transactional(db, to, "Nouvel abonné confirmé", [["heading", { text: "Nouvel abonné", fontSize: 24 }], ["text", { text: `**${sub.email}** vient de confirmer son inscription (source : ${sub.source}).` }]], "admin_notification");
        db.insert("Executions", { automation_key: "admin_signup_notification", status: r.status === "accepted" ? "ok" : "error", detail: { subscriberId: sub.id }, created_at: now() });
      }
    }
  }
  function unsubscribe(db, id, method, campaignId) {
    var _a, _b;
    const s = db.find("Abonnes", id);
    if (!s) return null;
    if (s.status !== "unsubscribed") {
      s.status = "unsubscribed";
      s.unsubscribed_at = (_a = s.unsubscribed_at) != null ? _a : now();
      db.touch("Abonnes");
      addSuppression(db, s.email, "unsubscribe");
      db.insert("Consentements", { subscriber_id: s.id, action: "unsubscribe", consent_text: null, source: method, user_agent: null, created_at: now() });
      for (const r of db.all("Destinataires")) if (r.subscriber_id === s.id && r.status === "pending") {
        r.status = "unsubscribed";
        r.updated_at = now();
      }
      db.touch("Destinataires");
      const camp = campaignId != null ? campaignId : (_b = db.all("Destinataires").filter((r) => r.subscriber_id === s.id && r.status === "accepted").sort((a, b2) => String(b2.sent_at).localeCompare(String(a.sent_at)))[0]) == null ? void 0 : _b.campaign_id;
      if (camp) db.insert("Evenements", { campaign_id: camp, recipient_id: null, subscriber_id: s.id, event_type: "unsubscribe", link_id: null, detail: { method }, created_at: now() });
    }
    return s;
  }
  function applyDeliveryEvent(db, type, email, diagnostic, rcpt) {
    var _a, _b, _c, _d, _e;
    const sub = db.all("Abonnes").find((x) => x.email === email.toLowerCase());
    db.insert("Evenements", { campaign_id: (_a = rcpt == null ? void 0 : rcpt.campaign_id) != null ? _a : null, recipient_id: (_b = rcpt == null ? void 0 : rcpt.id) != null ? _b : null, subscriber_id: (_c = sub == null ? void 0 : sub.id) != null ? _c : null, event_type: type === "hard_bounce" ? "bounce_hard" : type === "soft_bounce" ? "bounce_soft" : "complaint", link_id: null, detail: { diagnostic: diagnostic.slice(0, 300) }, created_at: now() });
    if (rcpt && type !== "complaint") {
      rcpt.status = "bounced";
      rcpt.last_error = diagnostic.slice(0, 300);
      rcpt.updated_at = now();
      db.touch("Destinataires");
    }
    if (!sub) return;
    if (type === "complaint") {
      unsubscribe(db, sub.id, "complaint");
      addSuppression(db, sub.email, "complaint");
    } else if (type === "hard_bounce") {
      if (["confirmed", "pending"].includes(sub.status)) sub.status = "bounced";
      sub.bounce_count = ((_d = sub.bounce_count) != null ? _d : 0) + 1;
      addSuppression(db, sub.email, "hard_bounce");
      db.touch("Abonnes");
    } else {
      sub.bounce_count = ((_e = sub.bounce_count) != null ? _e : 0) + 1;
      const recent = db.all("Evenements").filter((e) => e.subscriber_id === sub.id && e.event_type === "bounce_soft" && +new Date(e.created_at) > Date.now() - 30 * 864e5).length;
      if (recent >= 3 && sub.status === "confirmed") sub.status = "bounced";
      db.touch("Abonnes");
    }
  }
  function eligible(db, a) {
    var _a, _b, _c, _d;
    const supp = new Set(db.all("Exclusions").map((x) => x.email_hash));
    let rows = db.all("Abonnes").filter((x) => x.status === "confirmed" && !x.anonymized_at);
    let rules = null;
    if ((a == null ? void 0 : a.type) === "segment") rules = (_b = (_a = db.find("Segments", a.segmentId)) == null ? void 0 : _a.rules) != null ? _b : fail(400, "Segment introuvable");
    if ((a == null ? void 0 : a.type) === "rules") rules = a;
    if ((a == null ? void 0 : a.type) === "selection") rows = rows.filter((x) => {
      var _a2;
      return ((_a2 = a.subscriberIds) != null ? _a2 : []).includes(x.id);
    });
    if ((_c = rules == null ? void 0 : rules.sources) == null ? void 0 : _c.length) rows = rows.filter((x) => rules.sources.includes(x.source));
    if ((_d = rules == null ? void 0 : rules.tags) == null ? void 0 : _d.length) rows = rows.filter((x) => {
      var _a2;
      return ((_a2 = x.tags) != null ? _a2 : []).some((t) => rules.tags.includes(t));
    });
    return rows.filter((x) => !supp.has(emailHash(x.email)));
  }
  function campaignStats(db, id) {
    const rs = db.all("Destinataires").filter((r) => r.campaign_id === id);
    const ev = db.all("Evenements").filter((e) => e.campaign_id === id);
    const n = (f, list = rs) => list.filter(f).length;
    const accepted = n((r) => r.status === "accepted");
    const clickers = new Set(ev.filter((e) => e.event_type === "click").map((e) => e.recipient_id)).size;
    const links = db.all("Liens").filter((l) => l.campaign_id === id).map((l) => ({ url: l.url, clicks: n((e) => e.event_type === "click" && e.link_id === l.id, ev) })).sort((a, b2) => b2.clicks - a.clicks);
    return {
      targeted: rs.length,
      accepted,
      bounced: n((r) => r.status === "bounced"),
      failed: n((r) => r.status === "failed"),
      pending: n((r) => r.status === "pending" || r.status === "sending"),
      uncertain: n((r) => r.status === "uncertain"),
      skipped: n((r) => ["skipped", "unsubscribed"].includes(r.status)),
      clicks: n((e) => e.event_type === "click", ev),
      unique_clickers: clickers,
      unique_opens: 0,
      unsubscribes: n((e) => e.event_type === "unsubscribe", ev),
      complaints: n((e) => e.event_type === "complaint", ev),
      hard_bounces: n((e) => e.event_type === "bounce_hard", ev),
      soft_bounces: n((e) => e.event_type === "bounce_soft", ev),
      click_rate: accepted ? Math.round(clickers / accepted * 1e3) / 10 : null,
      links
    };
  }
  function renderForRecipient(db, camp, sub, rcpt) {
    var _a, _b;
    const s = getSettings();
    const links = new Map(db.all("Liens").filter((l) => l.campaign_id === camp.id).map((l) => [l.url, l.id]));
    const track = s.tracking.clicks && rcpt ? (url) => {
      const lid = links.get(url);
      return lid ? `${siteUrl()}#/r?k=${encodeURIComponent(recipientToken(rcpt.id))}&l=${lid}` : url;
    } : void 0;
    return renderEmail(camp.design, { subject: camp.subject, preheader: (_a = camp.preheader) != null ? _a : void 0, firstName: (_b = sub == null ? void 0 : sub.first_name) != null ? _b : null, unsubscribeUrl: sub ? unsubscribeUrl(sub.id) : `${siteUrl()}#/desinscription`, privacyUrl: `${siteUrl()}#/confidentialite`, legalText: s.organization.legalText, trackLink: track });
  }
  function listUnsubscribeHeaders(subscriberId, campaignId) {
    return { "List-Unsubscribe": `<${oneClickUrl(subscriberId)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", "List-Id": "La lettre de SanctiMaps <newsletter.sanctimaps.fr>", "X-Campaign-Id": String(campaignId) };
  }
  function prepareCampaign(db, camp) {
    var _a;
    if (camp.status !== "queued") return;
    const existing = new Set(db.all("Destinataires").filter((r) => r.campaign_id === camp.id).map((r) => r.subscriber_id));
    for (const s of eligible(db, camp.audience)) if (!existing.has(s.id)) db.insert("Destinataires", { campaign_id: camp.id, subscriber_id: s.id, email: s.email, status: "pending", attempts: 0, message_id: null, last_error: null, sent_at: null, updated_at: now() });
    const known = new Set(db.all("Liens").filter((l) => l.campaign_id === camp.id).map((l) => l.url));
    for (const url of collectLinks(camp.design)) if (!known.has(url)) db.insert("Liens", { campaign_id: camp.id, url });
    camp.status = "sending";
    camp.started_at = (_a = camp.started_at) != null ? _a : now();
    camp.recipient_count = db.all("Destinataires").filter((r) => r.campaign_id === camp.id).length;
    camp.updated_at = now();
    db.touch("Campagnes");
  }
  function period(q) {
    var _a, _b;
    const p = (_a = q.period) != null ? _a : "30d";
    let from;
    let to = /* @__PURE__ */ new Date();
    if (p === "custom" && q.from && q.to) {
      from = new Date(q.from);
      to = /* @__PURE__ */ new Date(`${q.to}T23:59:59`);
    } else from = new Date(Date.now() - ((_b = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 }[p]) != null ? _b : 30) * 864e5);
    const days = (+to - +from) / 864e5;
    return { from, to, bucket: days > 120 ? "month" : days > 45 ? "week" : "day" };
  }
  function buckets(from, to, bucket) {
    const out = [];
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), bucket === "month" ? 1 : from.getUTCDate()));
    while (d <= to) {
      out.push(new Date(d));
      if (bucket === "day") d.setUTCDate(d.getUTCDate() + 1);
      else if (bucket === "week") d.setUTCDate(d.getUTCDate() + 7);
      else d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return out;
  }
  function dashboard(db, q) {
    const { from, to, bucket } = period(q);
    const inP = (v) => v && new Date(v) >= from && new Date(v) <= to;
    const subs = db.all("Abonnes");
    const rcpts = db.all("Destinataires");
    const ev = db.all("Evenements");
    const camps = db.all("Campagnes");
    const bs = buckets(from, to, bucket);
    const series = bs.map((b2, i) => {
      var _a;
      const end = (_a = bs[i + 1]) != null ? _a : /* @__PURE__ */ new Date(+to + 1);
      const inB = (v) => v && new Date(v) >= b2 && new Date(v) < end;
      return {
        date: b2.toISOString().slice(0, 10),
        signups: subs.filter((x) => inB(x.created_at)).length,
        confirmations: subs.filter((x) => inB(x.confirmed_at)).length,
        unsubscribes: subs.filter((x) => inB(x.unsubscribed_at)).length,
        total: subs.filter((x) => x.confirmed_at && new Date(x.confirmed_at) < end && (!x.unsubscribed_at || new Date(x.unsubscribed_at) >= end)).length,
        accepted: rcpts.filter((r) => r.status === "accepted" && inB(r.sent_at)).length,
        bounced: rcpts.filter((r) => r.status === "bounced" && inB(r.updated_at)).length,
        clicks: ev.filter((e) => e.event_type === "click" && inB(e.created_at)).length
      };
    });
    const recentBy = (list, k, n = 6) => [...list].filter((x) => x[k] && !x.anonymized_at).sort((a, b2) => String(b2[k]).localeCompare(String(a[k]))).slice(0, n);
    const logs = db.all("Journal");
    return {
      period: { from, to, bucket },
      totals: {
        confirmed: subs.filter((x) => x.status === "confirmed").length,
        pending: subs.filter((x) => x.status === "pending").length,
        new_confirmed: subs.filter((x) => inP(x.confirmed_at)).length,
        new_signups: subs.filter((x) => inP(x.created_at)).length,
        unsubscribed_period: subs.filter((x) => inP(x.unsubscribed_at)).length,
        unsubscribed_total: subs.filter((x) => x.status === "unsubscribed").length,
        bounced_total: subs.filter((x) => x.status === "bounced").length
      },
      content: { newsletters: db.all("Newsletters").length, campaigns_sent: camps.filter((c) => c.status === "sent").length, campaigns_scheduled: camps.filter((c) => c.status === "scheduled").length, campaigns_sending: camps.filter((c) => ["queued", "sending"].includes(c.status)).length },
      delivery: { accepted: rcpts.filter((r) => r.status === "accepted" && inP(r.sent_at)).length, bounced: rcpts.filter((r) => r.status === "bounced" && inP(r.updated_at)).length, failed: rcpts.filter((r) => r.status === "failed" && inP(r.updated_at)).length },
      clicks: { clicks: ev.filter((e) => e.event_type === "click" && inP(e.created_at)).length, unique_clickers: new Set(ev.filter((e) => e.event_type === "click" && inP(e.created_at)).map((e) => e.recipient_id)).size },
      growth: series.map(({ date, signups, confirmations, unsubscribes, total }) => ({ date, signups, confirmations, unsubscribes, total })),
      activity: series.map(({ date, accepted, bounced, clicks }) => ({ date, accepted, bounced, clicks })),
      comparison: camps.filter((c) => c.started_at).sort((a, b2) => String(b2.started_at).localeCompare(String(a.started_at))).slice(0, 8).map((c) => {
        const st = campaignStats(db, c.id);
        return { id: c.id, name: c.name, finished_at: c.finished_at, accepted: st.accepted, bounced: st.bounced, clickers: st.unique_clickers, unsubscribes: st.unsubscribes };
      }),
      recent: {
        signups: recentBy(subs, "created_at"),
        unsubscribes: recentBy(subs, "unsubscribed_at"),
        campaigns: [...camps].sort((a, b2) => String(b2.updated_at).localeCompare(String(a.updated_at))).slice(0, 6).map(({ design, ...c }) => c),
        sends: [...logs].reverse().slice(0, 6),
        errors: [...logs].reverse().filter((l) => l.status !== "accepted").slice(0, 6),
        jobErrors: []
      }
    };
  }
  var norm = (v) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_-]+/g, " ").trim();
  function parseCsv(text) {
    var _a, _b, _c, _d, _e;
    const first = (_a = text.split(/\r?\n/)[0]) != null ? _a : "";
    const delim = ((_c = (_b = first.match(/;/g)) == null ? void 0 : _b.length) != null ? _c : 0) > ((_e = (_d = first.match(/,/g)) == null ? void 0 : _d.length) != null ? _e : 0) ? ";" : first.includes("	") ? "	" : ",";
    return { delim, rows: Utilities.parseCsv(text.replace(/^﻿/, ""), delim).filter((r) => r.some((c) => String(c).trim())).map((r) => r.map((c) => String(c).trim())) };
  }
  var csvCell = (v) => {
    const s = v == null ? "" : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  function sniff(bytes) {
    const b2 = bytes.slice(0, 12).map((x) => x < 0 ? x + 256 : x);
    if (b2[0] === 137 && b2[1] === 80 && b2[2] === 78 && b2[3] === 71) return "image/png";
    if (b2[0] === 255 && b2[1] === 216 && b2[2] === 255) return "image/jpeg";
    if (b2[0] === 71 && b2[1] === 73 && b2[2] === 70) return "image/gif";
    if (b2[0] === 82 && b2[1] === 73 && b2[8] === 87 && b2[9] === 69) return "image/webp";
    return null;
  }
  function mediaFolder() {
    const p = props();
    const id = p.getProperty("MEDIA_FOLDER_ID");
    if (id) {
      try {
        return DriveApp.getFolderById(id);
      } catch {
      }
    }
    const f = DriveApp.createFolder("Newsletter Studio — images");
    p.setProperty("MEDIA_FOLDER_ID", f.getId());
    return f;
  }
  function storeImage(file) {
    var _a;
    if (!(file == null ? void 0 : file.data)) fail(400, "Aucun fichier reçu.");
    const bytes = Utilities.base64Decode(file.data);
    if (bytes.length > 5 * 1024 * 1024) fail(400, "Image trop lourde (5 Mo maximum).");
    const mime = (_a = sniff(bytes)) != null ? _a : fail(400, "Format non autorisé : PNG, JPEG, GIF ou WebP uniquement.");
    const ext = mime.split("/")[1].replace("jpeg", "jpg");
    const name = `${now().slice(0, 7)}-${randomToken().slice(0, 12)}.${ext}`;
    const f = mediaFolder().createFile(Utilities.newBlob(bytes, mime, name));
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { file_id: f.getId(), filename: name, mime_type: mime, size_bytes: bytes.length, url: `https://lh3.googleusercontent.com/d/${f.getId()}` };
  }
  function txt(name) {
    var _a;
    try {
      const res = JSON.parse(UrlFetchApp.fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`, { muteHttpExceptions: true }).getContentText());
      return ((_a = res.Answer) != null ? _a : []).filter((a) => a.type === 16).map((a) => String(a.data).replace(/^"|"$/g, "").replace(/" "/g, ""));
    } catch (e) {
      return `résolution impossible (${e.message})`;
    }
  }
  function checkDomain(fromEmail, selector) {
    var _a, _b;
    const domain = (_b = (_a = fromEmail.split("@")[1]) == null ? void 0 : _a.toLowerCase()) != null ? _b : "";
    const details = {};
    const spfR = txt(domain);
    const spfs = Array.isArray(spfR) ? spfR.filter((r) => /^v=spf1/i.test(r)) : [];
    details.spf = typeof spfR === "string" ? spfR : spfs.length === 1 ? spfs[0] : spfs.length ? `Plusieurs enregistrements SPF (invalide)` : "Aucun enregistrement SPF trouvé.";
    const dm = txt(`_dmarc.${domain}`);
    const dmarc = Array.isArray(dm) ? dm.find((r) => /^v=DMARC1/i.test(r)) : void 0;
    details.dmarc = typeof dm === "string" ? dm : dmarc != null ? dmarc : "Aucun enregistrement DMARC trouvé.";
    let dkim = false;
    if (!selector) details.dkim = "Sélecteur DKIM non renseigné.";
    else {
      const dk = txt(`${selector}._domainkey.${domain}`);
      const rec = Array.isArray(dk) ? dk.find((r) => /p=/.test(r)) : void 0;
      dkim = Boolean(rec);
      details.dkim = typeof dk === "string" ? dk : rec ? `${rec.slice(0, 80)}…` : "Aucune clé DKIM trouvée pour ce sélecteur.";
    }
    return { checkedAt: now(), domain, spf: spfs.length === 1, dkim, dmarc: Boolean(dmarc), details };
  }
  function route(c, method, path, body) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S, _T, _U, _V, _W, _X, _Y, _Z, __, _$, _aa, _ba, _ca;
    const { db } = c;
    const url = path.split("?");
    const p = url[0];
    const q = Object.fromEntries(((_a = url[1]) != null ? _a : "").split("&").filter(Boolean).map((kv) => kv.split("=").map(decodeURIComponent)));
    const m = (re) => p.match(re);
    let r;
    const settings = getSettings();
    body = body != null ? body : {};
    if (p === "/api/public/config") return { consentText: CONSENT_TEXT, confirmationHours: 48, purpose: PURPOSE, needsSetup: db.all("Comptes").length === 0 };
    if (p === "/api/public/subscribe") {
      if (body.consent !== true) fail(400, "Le consentement explicite est obligatoire.");
      const ok = { ok: true, message: "Merci ! Si cette adresse est valide, vous allez recevoir un e-mail pour confirmer votre inscription. Pensez à vérifier vos courriers indésirables." };
      if (body.website) return ok;
      if (body.startedAt && Date.now() - Number(body.startedAt) < 2500) return ok;
      const email = String((_b = body.email) != null ? _b : "").trim().toLowerCase();
      if (!isEmail(email)) fail(400, "Adresse e-mail invalide.");
      const k = `subs_${Math.floor(Date.now() / 6e5)}`;
      const n = Number((_c = cache().get(k)) != null ? _c : 0);
      if (n >= 20) fail(429, "Trop de demandes d'inscription en ce moment. Réessayez dans quelques minutes.");
      cache().put(k, String(n + 1), 700);
      const firstName = cleanName(body.firstName);
      const source = body.source === "site-principal" ? "site-principal" : "formulaire";
      let s = db.all("Abonnes").find((x) => x.email === email);
      if (s && (s.status === "confirmed" || s.status === "suspended" || s.anonymized_at)) return ok;
      if (s && db.all("Jetons").some((t) => t.subscriber_id === s.id && +new Date(t.created_at) > Date.now() - 12e4)) return ok;
      if (!s) s = db.insert("Abonnes", { email, first_name: firstName, last_name: null, status: "pending", source, tags: [], subscribed_at: now(), confirmed_at: null, unsubscribed_at: null, bounce_count: 0, last_activity_at: null, anonymized_at: null, notes: null, created_at: now() });
      else if (firstName && !s.first_name) {
        s.first_name = firstName;
        db.touch("Abonnes");
      }
      db.insert("Consentements", { subscriber_id: s.id, action: s.status === "unsubscribed" ? "resubscribe_request" : "request", consent_text: CONSENT_TEXT, source, user_agent: c.userAgent.slice(0, 300), created_at: now() });
      sendConfirmation(db, s, newConfirmationToken(db, s.id));
      return ok;
    }
    if (p === "/api/public/confirm") {
      const t = db.all("Jetons").find((x) => {
        var _a2;
        return x.token_hash === sha256(String((_a2 = body.token) != null ? _a2 : ""));
      });
      if (!t) fail(400, "Ce lien de confirmation n'est pas valide.");
      if (t.used_at) fail(400, "Ce lien a déjà été utilisé : votre inscription est probablement déjà confirmée.");
      if (new Date(t.expires_at) < /* @__PURE__ */ new Date()) fail(400, "Ce lien a expiré (validité 48 h). Inscrivez-vous de nouveau pour en recevoir un autre.");
      t.used_at = now();
      db.touch("Jetons");
      const s = db.find("Abonnes", t.subscriber_id);
      if (!s || !["pending", "unsubscribed"].includes(s.status) || s.anonymized_at) fail(400, "Ce lien de confirmation n'est pas valide.");
      Object.assign(s, { status: "confirmed", confirmed_at: now(), unsubscribed_at: null });
      db.touch("Abonnes");
      db.insert("Consentements", { subscriber_id: s.id, action: "confirm", consent_text: CONSENT_TEXT, source: s.source, user_agent: c.userAgent.slice(0, 300), created_at: now() });
      db.set("Exclusions", db.all("Exclusions").filter((x) => !(x.email_hash === emailHash(s.email) && ["unsubscribe", "manual"].includes(x.reason))));
      onConfirmed(db, s);
      return { ok: true, firstName: s.first_name };
    }
    if (p === "/api/public/unsubscribe" && method === "GET") {
      const id = readUnsubscribeToken(q.t);
      const s = id ? db.find("Abonnes", id) : null;
      if (!s) fail(400, "Lien de désinscription invalide.");
      const [u, d] = s.email.split("@");
      return { ok: true, email: s.anonymized_at ? null : `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`, status: s.status };
    }
    if (p === "/api/public/unsubscribe" || p === "/api/public/unsubscribe/one-click") {
      const id = readUnsubscribeToken((_d = body.t) != null ? _d : q.t);
      if (!id || !unsubscribe(db, id, p.endsWith("one-click") ? "one-click" : "page")) fail(400, "Lien de désinscription invalide.");
      return { ok: true };
    }
    if (p === "/api/public/privacy") return { markdown: settings.privacyPolicy.markdown || politique_confidentialite_default, reviewed: settings.privacyPolicy.reviewed, contactEmail: settings.organization.contactEmail, organization: settings.organization.name };
    if (p === "/api/public/click") {
      const link = (_e = db.find("Liens", body.l)) != null ? _e : fail(404, "Lien introuvable.");
      const rid = readRecipientToken(body.k);
      const rc = rid ? db.find("Destinataires", rid) : null;
      if (rc && rc.campaign_id === link.campaign_id) {
        db.insert("Evenements", { campaign_id: rc.campaign_id, recipient_id: rc.id, subscriber_id: rc.subscriber_id, event_type: "click", link_id: link.id, detail: null, created_at: now() });
        const s = db.find("Abonnes", rc.subscriber_id);
        if (s) {
          s.last_activity_at = now();
          db.touch("Abonnes");
        }
      }
      return { url: link.url };
    }
    if (p === "/api/auth/setup") {
      if (db.all("Comptes").length) fail(403, "Un administrateur existe déjà.");
      const code = props().getProperty("SETUP_CODE");
      if (!code || !safeEqual(String((_f = body.code) != null ? _f : "").trim(), code)) fail(403, "Code d'installation incorrect (visible dans le journal d'exécution de la fonction « installer »).");
      if (!isEmail(body.email)) fail(400, "Adresse e-mail invalide.");
      const u = db.insert("Comptes", { email: String(body.email).toLowerCase(), display_name: (_g = cleanName(body.name)) != null ? _g : "Administrateur", role: "admin", password_hash: hashPassword(passwordOk(body.password)), totp_secret: null, totp_enabled: false, failed_logins: 0, locked_until: null, last_login_at: now(), created_at: now() });
      props().deleteProperty("SETUP_CODE");
      c.user = u;
      audit(c, "auth.setup", "user", u.id);
      return { user: publicUser(u), token: openSession(u.id, false) };
    }
    if (p === "/api/auth/login") {
      const u = db.all("Comptes").find((x) => {
        var _a2;
        return x.email === String((_a2 = body.email) != null ? _a2 : "").trim().toLowerCase();
      });
      if (!u) {
        verifyPassword(String((_h = body.password) != null ? _h : ""), "pbkdf2$500$00$00");
        fail(401, "Identifiants incorrects.");
      }
      if (u.locked_until && new Date(u.locked_until) > /* @__PURE__ */ new Date()) fail(429, "Compte temporairement verrouillé après plusieurs échecs. Réessayez dans 15 minutes.");
      if (!verifyPassword(String((_i = body.password) != null ? _i : ""), u.password_hash)) {
        u.failed_logins = ((_j = u.failed_logins) != null ? _j : 0) + 1;
        if (u.failed_logins >= 5) {
          u.failed_logins = 0;
          u.locked_until = new Date(Date.now() + 15 * 6e4).toISOString();
        }
        db.touch("Comptes");
        c.user = u;
        audit(c, "auth.login_failed", "user", u.id);
        fail(401, "Identifiants incorrects.");
      }
      u.failed_logins = 0;
      u.locked_until = null;
      db.touch("Comptes");
      if (u.totp_enabled) return { twoFactorRequired: true, token: openSession(u.id, true) };
      u.last_login_at = now();
      c.user = u;
      audit(c, "auth.login", "user", u.id);
      return { user: publicUser(u), token: openSession(u.id, false) };
    }
    if (p === "/api/auth/2fa") {
      const s = sessionOf(body.__token);
      if (!(s == null ? void 0 : s.pending2fa)) fail(401, "Session expirée, reconnectez-vous.");
      const u = db.find("Comptes", s.uid);
      if (!(u == null ? void 0 : u.totp_secret) || !verifyTotp(u.totp_secret, body.code)) fail(401, "Code incorrect.");
      cache().remove(`sess_${sha256(body.__token)}`);
      u.last_login_at = now();
      db.touch("Comptes");
      c.user = u;
      audit(c, "auth.login", "user", u.id, { twoFactor: true });
      return { user: publicUser(u), token: openSession(u.id, false) };
    }
    if (p === "/api/auth/logout") {
      if (body.__token) cache().remove(`sess_${sha256(body.__token)}`);
      return { ok: true };
    }
    if (p === "/api/auth/me") {
      if (!c.user) fail(401, "Non connecté.");
      return { user: publicUser(c.user), token: body.__token };
    }
    if (p === "/api/auth/password-reset/request") {
      const u = db.all("Comptes").find((x) => {
        var _a2;
        return x.email === String((_a2 = body.email) != null ? _a2 : "").trim().toLowerCase();
      });
      if (u) {
        const t = randomToken();
        cache().put(`reset_${sha256(t)}`, String(u.id), 3600);
        transactional(db, u.email, "Réinitialisation de votre mot de passe — Newsletter Studio", [["heading", { text: "Réinitialiser le mot de passe", fontSize: 24 }], ["text", { text: "Une réinitialisation du mot de passe de votre compte a été demandée. Le lien est valable 1 heure.", align: "center" }], ["button", { label: "Choisir un nouveau mot de passe", url: `${siteUrl()}#/admin/reinitialisation?t=${t}` }]], "password_reset");
      }
      return { ok: true, message: "Si un compte correspond à cette adresse, un lien de réinitialisation valable 1 heure a été envoyé." };
    }
    if (p === "/api/auth/password-reset/confirm") {
      const key = `reset_${sha256(String((_k = body.token) != null ? _k : ""))}`;
      const uid = cache().get(key);
      if (!uid) fail(400, "Lien invalide ou expiré.");
      const u = db.find("Comptes", uid);
      u.password_hash = hashPassword(passwordOk(body.password));
      u.failed_logins = 0;
      u.locked_until = null;
      db.touch("Comptes");
      cache().remove(key);
      c.user = u;
      audit(c, "auth.password_reset", "user", u.id);
      return { ok: true };
    }
    if (p.startsWith("/api/auth/")) {
      need(c, "viewer");
      const u = c.user;
      if (p === "/api/auth/password") {
        if (!verifyPassword(String((_l = body.current) != null ? _l : ""), u.password_hash)) fail(400, "Mot de passe actuel incorrect.");
        u.password_hash = hashPassword(passwordOk(body.next));
        db.touch("Comptes");
        audit(c, "auth.password_changed", "user", u.id);
        return { ok: true };
      }
      if (p === "/api/auth/2fa/setup") {
        const sec = newTotpSecret();
        if (!u.totp_enabled) {
          u.totp_secret = sec;
          db.touch("Comptes");
        }
        return { secret: sec, otpauth: `otpauth://totp/${encodeURIComponent(`SanctiMaps Newsletter:${u.email}`)}?secret=${sec}&issuer=SanctiMaps%20Newsletter&digits=6&period=30` };
      }
      if (p === "/api/auth/2fa/enable") {
        if (!u.totp_secret || !verifyTotp(u.totp_secret, body.code)) fail(400, "Code incorrect : vérifiez l'heure de votre téléphone.");
        u.totp_enabled = true;
        db.touch("Comptes");
        audit(c, "auth.2fa_enabled", "user", u.id);
        return { ok: true };
      }
      if (p === "/api/auth/2fa/disable") {
        if (!verifyPassword(String((_m = body.password) != null ? _m : ""), u.password_hash)) fail(400, "Mot de passe incorrect.");
        u.totp_enabled = false;
        u.totp_secret = null;
        db.touch("Comptes");
        audit(c, "auth.2fa_disabled", "user", u.id);
        return { ok: true };
      }
    }
    if (!p.startsWith("/api/admin/")) fail(404, "Introuvable.");
    need(c, method === "GET" || p === "/api/admin/render" || p === "/api/admin/audience/count" || p === "/api/admin/profile" ? "viewer" : "editor");
    if (p === "/api/admin/dashboard") return dashboard(db, q);
    if (p === "/api/admin/stats/campaigns") {
      const { from, to } = period(q);
      const camps = db.all("Campagnes").filter((x) => x.started_at && new Date(x.started_at) >= from && new Date(x.started_at) <= to).sort((a, b2) => String(b2.started_at).localeCompare(String(a.started_at))).map(({ design, ...x }) => ({ ...x, stats: campaignStats(db, x.id) }));
      const totals = camps.reduce((a, x) => ({ targeted: a.targeted + x.stats.targeted, accepted: a.accepted + x.stats.accepted, bounced: a.bounced + x.stats.bounced, clickers: a.clickers + x.stats.unique_clickers, clicks: a.clicks + x.stats.clicks, unsubscribes: a.unsubscribes + x.stats.unsubscribes, opens: 0 }), { targeted: 0, accepted: 0, bounced: 0, clickers: 0, clicks: 0, unsubscribes: 0, opens: 0 });
      const by = {};
      for (const x of db.all("Abonnes").filter((y) => y.status === "confirmed")) by[x.source] = ((_n = by[x.source]) != null ? _n : 0) + 1;
      return { period: period(q), campaigns: camps, totals, sources: Object.entries(by).map(([source, n]) => ({ source, n })).sort((a, b2) => b2.n - a.n), opensTracked: false };
    }
    if (p === "/api/admin/subscribers" && method === "GET") {
      let rows = db.all("Abonnes").filter((x) => !x.anonymized_at);
      const counts = {};
      for (const x of rows) counts[x.status] = ((_o = counts[x.status]) != null ? _o : 0) + 1;
      const term = String((_p = q.q) != null ? _p : "").toLowerCase();
      if (term) rows = rows.filter((x) => [x.email, x.first_name, x.last_name].some((v) => String(v != null ? v : "").toLowerCase().includes(term)));
      if (q.status) rows = rows.filter((x) => x.status === q.status);
      if (q.source) rows = rows.filter((x) => x.source === q.source);
      const by = (k, dir = 1) => (a, b2) => {
        var _a2, _b2;
        return dir * String((_a2 = a[k]) != null ? _a2 : "￿").localeCompare(String((_b2 = b2[k]) != null ? _b2 : "￿"));
      };
      const sorts = { created_desc: by("created_at", -1), created_asc: by("created_at"), email_asc: by("email"), email_desc: by("email", -1), name_asc: by("first_name"), confirmed_desc: (a, b2) => {
        var _a2, _b2;
        return String((_a2 = b2.confirmed_at) != null ? _a2 : "").localeCompare(String((_b2 = a.confirmed_at) != null ? _b2 : ""));
      } };
      rows = [...rows].sort((_q = sorts[q.sort]) != null ? _q : sorts.created_desc);
      const page = Math.max(1, Number((_r = q.page) != null ? _r : 1));
      const size = Math.min(200, Math.max(5, Number((_s = q.pageSize) != null ? _s : 25)));
      return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pageSize: size, counts };
    }
    if (p === "/api/admin/subscribers/sources") return [...new Set(db.all("Abonnes").map((x) => x.source))].sort();
    if (p === "/api/admin/subscribers" && method === "POST") {
      const email = String((_t = body.email) != null ? _t : "").trim().toLowerCase();
      if (!isEmail(email)) fail(400, "Adresse e-mail invalide");
      if (db.all("Abonnes").some((x) => x.email === email)) fail(409, "Cette adresse existe déjà.");
      const supp = suppressed(db, email);
      if (supp) fail(409, `Cette adresse figure sur la liste d'exclusion (${supp}). Seule la personne elle-même peut se réinscrire via le formulaire.`);
      const s = db.insert("Abonnes", { email, first_name: cleanName(body.firstName), last_name: cleanName(body.lastName), status: "pending", source: "ajout-manuel", tags: ((_u = body.tags) != null ? _u : []).slice(0, 20), subscribed_at: now(), confirmed_at: null, unsubscribed_at: null, bounce_count: 0, last_activity_at: null, anonymized_at: null, notes: (_v = body.notes) != null ? _v : null, created_at: now() });
      db.insert("Consentements", { subscriber_id: s.id, action: "admin_add", consent_text: body.consentNote || "Ajout manuel par l'administrateur", source: "ajout-manuel", user_agent: null, created_at: now() });
      if (body.sendConfirmation !== false) sendConfirmation(db, s, newConfirmationToken(db, s.id));
      audit(c, "subscriber.create", "subscriber", s.id);
      return s;
    }
    if (r = m(/^\/api\/admin\/subscribers\/(\d+)\/export$/)) {
      need(c, "admin");
      const s = (_w = db.find("Abonnes", r[1])) != null ? _w : fail(404, "Abonné introuvable.");
      audit(c, "subscriber.export_personal_data", "subscriber", s.id);
      return { generated_at: now(), controller: "SanctiMaps — https://sanctimaps.fr/", subscriber: s, consent_records: db.all("Consentements").filter((x) => x.subscriber_id === s.id), campaigns_received: db.all("Destinataires").filter((x) => x.subscriber_id === s.id).map((x) => {
        var _a2;
        return { campaign: (_a2 = db.find("Campagnes", x.campaign_id)) == null ? void 0 : _a2.name, status: x.status, sent_at: x.sent_at };
      }), events: db.all("Evenements").filter((x) => x.subscriber_id === s.id) };
    }
    if (r = m(/^\/api\/admin\/subscribers\/(\d+)$/)) {
      const s = db.find("Abonnes", r[1]);
      if (!s || s.anonymized_at) fail(404, "Abonné introuvable.");
      if (method === "GET") return { subscriber: s, consents: db.all("Consentements").filter((x) => x.subscriber_id === s.id).reverse(), campaigns: db.all("Destinataires").filter((x) => x.subscriber_id === s.id).map((x) => {
        var _a2;
        return { id: x.campaign_id, name: (_a2 = db.find("Campagnes", x.campaign_id)) == null ? void 0 : _a2.name, status: x.status, sent_at: x.sent_at, last_error: x.last_error };
      }), events: db.all("Evenements").filter((x) => x.subscriber_id === s.id) };
      if (method === "DELETE") {
        need(c, "admin");
        addSuppression(db, s.email, "erasure");
        for (const x of db.all("Destinataires")) if (x.subscriber_id === s.id) {
          x.email = "anonymise";
          if (x.status === "pending") x.status = "skipped";
        }
        for (const l of db.all("Journal")) if (l.to_email === s.email) l.to_email = "anonymise";
        for (const x of db.all("Consentements")) if (x.subscriber_id === s.id) x.user_agent = null;
        db.set("Jetons", db.all("Jetons").filter((t) => t.subscriber_id !== s.id));
        Object.assign(s, { email: `anonyme-${s.id}-${randomToken().slice(0, 6)}@anonymise.invalid`, first_name: null, last_name: null, notes: null, tags: [], status: "unsubscribed", unsubscribed_at: (_x = s.unsubscribed_at) != null ? _x : now(), anonymized_at: now() });
        ["Abonnes", "Destinataires", "Journal", "Consentements"].forEach((t) => db.touch(t));
        audit(c, "subscriber.anonymize", "subscriber", s.id);
        return { ok: true };
      }
      if (body.status === "confirmed") fail(400, "Le statut « confirmé » ne peut pas être posé à la main.");
      if (body.firstName !== void 0) s.first_name = cleanName(body.firstName);
      if (body.lastName !== void 0) s.last_name = cleanName(body.lastName);
      if (body.tags) s.tags = body.tags.slice(0, 20);
      if (body.notes !== void 0) s.notes = String((_y = body.notes) != null ? _y : "").slice(0, 2e3);
      if (body.status === "suspended") s.status = "suspended";
      if (body.status === "unsubscribed") unsubscribe(db, s.id, "admin");
      if (body.status === "restore") {
        if (s.status !== "suspended") fail(400, "Seule une adresse suspendue peut être rétablie.");
        s.status = s.confirmed_at && !s.unsubscribed_at ? "confirmed" : "pending";
      }
      db.touch("Abonnes");
      audit(c, "subscriber.update", "subscriber", s.id, body);
      return s;
    }
    if (p === "/api/admin/subscribers-export.csv") {
      need(c, "admin");
      const st = q.status || "confirmed";
      const rows = db.all("Abonnes").filter((x) => x.status === st && !x.anonymized_at);
      audit(c, "subscriber.export_csv", "subscriber", null, { status: st, count: rows.length });
      return "\uFEFF" + ["email;prenom;nom;statut;source;inscription;confirmation;desinscription", ...rows.map((x) => [x.email, x.first_name, x.last_name, x.status, x.source, x.subscribed_at, x.confirmed_at, x.unsubscribed_at].map(csvCell).join(";"))].join("\n");
    }
    if (p === "/api/admin/subscribers/import/preview") {
      const f = (_z = body.file) != null ? _z : fail(400, "Aucun fichier reçu.");
      if (!/\.(csv|txt)$/i.test(f.name)) fail(400, "Le fichier doit être au format .csv.");
      const text = Utilities.newBlob(Utilities.base64Decode(f.data)).getDataAsString("UTF-8");
      if (text.length > 2 * 1024 * 1024) fail(400, "Fichier trop volumineux (2 Mo maximum).");
      if (text.includes("\0")) fail(400, "Le fichier ne semble pas être un fichier texte CSV.");
      const { delim, rows } = parseCsv(text);
      if (!rows.length) fail(400, "Fichier vide.");
      if (rows.length > 10001) fail(400, "10 000 lignes maximum par import.");
      const head = rows[0].map(norm);
      const pick = (al) => head.findIndex((h) => al.includes(h));
      const mapping = {};
      const e = pick(["email", "e mail", "mail", "courriel", "adresse", "adresse e mail", "adresse email", "email address"]);
      if (e >= 0) mapping.email = e;
      const fi = pick(["prenom", "first name", "firstname", "given name"]);
      if (fi >= 0) mapping.first_name = fi;
      const la = pick(["nom", "last name", "lastname", "nom de famille", "surname"]);
      if (la >= 0) mapping.last_name = la;
      let data = rows.slice(1);
      let offset = 2;
      if (mapping.email === void 0) {
        const i = rows[0].findIndex(isEmail);
        if (i < 0) fail(400, "Aucune colonne « email » détectée.");
        mapping.email = i;
        data = rows;
        offset = 1;
      }
      const existing = new Map(db.all("Abonnes").map((x) => [x.email, x.status]));
      const supp = new Set(db.all("Exclusions").map((x) => x.email_hash));
      const seen = /* @__PURE__ */ new Set();
      const out = data.map((row, i) => {
        var _a2, _b2, _c2;
        const email = String((_a2 = row[mapping.email]) != null ? _a2 : "").trim().toLowerCase();
        let status = "ok";
        if (!isEmail(email)) status = "invalid";
        else if (seen.has(email)) status = "duplicate_file";
        else if (supp.has(emailHash(email))) status = "suppressed";
        else if (existing.has(email)) status = "exists";
        seen.add(email);
        return { line: i + offset, email, firstName: mapping.first_name !== void 0 ? String((_b2 = row[mapping.first_name]) != null ? _b2 : "").slice(0, 80) : "", lastName: mapping.last_name !== void 0 ? String((_c2 = row[mapping.last_name]) != null ? _c2 : "").slice(0, 80) : "", status, note: "" };
      });
      const summary = out.reduce((a, x) => {
        var _a2;
        return { ...a, [x.status]: ((_a2 = a[x.status]) != null ? _a2 : 0) + 1 };
      }, {});
      return { filename: f.name, delimiter: delim, columns: rows[0], mapping, summary, total: out.length, rows: out };
    }
    if (p === "/api/admin/subscribers/import/commit") {
      if (!String((_A = body.sourceLabel) != null ? _A : "").trim()) fail(400, "Nom de la source obligatoire.");
      if (String((_B = body.consentNote) != null ? _B : "").trim().length < 10) fail(400, "Décrivez l'origine du consentement (10 caractères minimum).");
      const source = `import:${String(body.sourceLabel).replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 50)}`;
      let imported = 0, skipped = 0;
      for (const row of ((_C = body.rows) != null ? _C : []).slice(0, 1e4)) {
        const email = String((_D = row.email) != null ? _D : "").trim().toLowerCase();
        if (!isEmail(email) || suppressed(db, email) || db.all("Abonnes").some((x) => x.email === email)) {
          skipped++;
          continue;
        }
        const s = db.insert("Abonnes", { email, first_name: cleanName(row.firstName), last_name: cleanName(row.lastName), status: "pending", source, tags: [], subscribed_at: now(), confirmed_at: null, unsubscribed_at: null, bounce_count: 0, last_activity_at: null, anonymized_at: null, notes: null, created_at: now() });
        db.insert("Consentements", { subscriber_id: s.id, action: "import", consent_text: body.consentNote, source, user_agent: null, created_at: now() });
        if (body.sendConfirmation) sendConfirmation(db, s, newConfirmationToken(db, s.id));
        imported++;
      }
      audit(c, "subscriber.import", "subscriber", null, { imported, skipped, source });
      return { imported, skipped };
    }
    if (p === "/api/admin/segments") {
      if (method === "GET") return db.all("Segments");
      if (!String((_E = body.name) != null ? _E : "").trim()) fail(400, "Nom obligatoire.");
      return db.insert("Segments", { name: String(body.name).slice(0, 80), rules: (_F = body.rules) != null ? _F : {}, created_at: now() });
    }
    if (r = m(/^\/api\/admin\/segments\/(\d+)$/)) {
      db.set("Segments", db.all("Segments").filter((x) => x.id !== Number(r[1])));
      return { ok: true };
    }
    const checkDesign = (d) => {
      if (!(d == null ? void 0 : d.settings) || !Array.isArray(d.blocks) || d.blocks.length > 80) fail(400, "Contenu invalide.");
      return d;
    };
    if (p === "/api/admin/newsletters") {
      if (method === "GET") return [...db.all("Newsletters")].sort((a, b2) => String(b2.updated_at).localeCompare(String(a.updated_at))).map(({ design, ...n2 }) => {
        var _a2, _b2;
        return { ...n2, block_count: (_b2 = (_a2 = design == null ? void 0 : design.blocks) == null ? void 0 : _a2.length) != null ? _b2 : 0, campaign_count: db.all("Campagnes").filter((x) => x.newsletter_id === n2.id).length };
      });
      const n = db.insert("Newsletters", { title: String(body.title || "Sans titre").slice(0, 150), design: checkDesign(body.design), template_id: (_G = body.templateId) != null ? _G : null, created_at: now(), updated_at: now() });
      audit(c, "newsletter.create", "newsletter", n.id);
      return n;
    }
    if (r = m(/^\/api\/admin\/newsletters\/(\d+)\/duplicate$/)) {
      const n = (_H = db.find("Newsletters", r[1])) != null ? _H : fail(404, "Newsletter introuvable.");
      return db.insert("Newsletters", { ...clone(n), id: null, title: `${n.title} (copie)`, created_at: now(), updated_at: now() });
    }
    if (r = m(/^\/api\/admin\/newsletters\/(\d+)$/)) {
      const n = (_I = db.find("Newsletters", r[1])) != null ? _I : fail(404, "Newsletter introuvable.");
      if (method === "GET") return n;
      if (method === "DELETE") {
        db.set("Newsletters", db.all("Newsletters").filter((x) => x.id !== n.id));
        audit(c, "newsletter.delete", "newsletter", n.id);
        return { ok: true };
      }
      Object.assign(n, { title: String(body.title || "Sans titre").slice(0, 150), design: checkDesign(body.design), updated_at: now() });
      db.touch("Newsletters");
      return n;
    }
    if (p === "/api/admin/templates") {
      if (method === "GET") return db.all("Modeles");
      return db.insert("Modeles", { name: String(body.name || "Modèle").slice(0, 100), description: String((_J = body.description) != null ? _J : "").slice(0, 300), category: "personnalise", is_system: false, design: checkDesign(body.design), created_at: now(), updated_at: now() });
    }
    if (r = m(/^\/api\/admin\/templates\/(\d+)\/duplicate$/)) {
      const t = (_K = db.find("Modeles", r[1])) != null ? _K : fail(404, "Modèle introuvable.");
      return db.insert("Modeles", { ...clone(t), id: null, name: `${t.name} (copie)`, is_system: false, created_at: now(), updated_at: now() });
    }
    if (r = m(/^\/api\/admin\/templates\/(\d+)$/)) {
      const t = (_L = db.find("Modeles", r[1])) != null ? _L : fail(404, "Modèle introuvable.");
      if (method === "GET") return t;
      if (method === "DELETE") {
        db.set("Modeles", db.all("Modeles").filter((x) => x.id !== t.id));
        audit(c, "template.delete", "template", t.id);
        return { ok: true };
      }
      Object.assign(t, { name: String(body.name || t.name).slice(0, 100), description: String((_M = body.description) != null ? _M : "").slice(0, 300), design: checkDesign(body.design), updated_at: now() });
      db.touch("Modeles");
      return t;
    }
    if (p === "/api/admin/render") return renderEmail(checkDesign(body.design), { subject: (_N = body.subject) != null ? _N : "Aperçu", preheader: body.preheader, sampleData: body.sample !== false, firstName: null, unsubscribeUrl: `${siteUrl()}#/desinscription`, privacyUrl: `${siteUrl()}#/confidentialite`, legalText: settings.organization.legalText });
    if (p === "/api/admin/media") {
      if (method === "GET") return [...db.all("Medias")].reverse();
      const stored = storeImage(body.file);
      const md = db.insert("Medias", { ...stored, original_name: String(body.file.name).slice(0, 200), width: (_O = body.file.width) != null ? _O : null, height: (_P = body.file.height) != null ? _P : null, alt_text: String((_Q = body.alt) != null ? _Q : "").slice(0, 300), created_at: now() });
      audit(c, "media.upload", "media", md.id);
      return md;
    }
    if (r = m(/^\/api\/admin\/media\/(\d+)\/replace$/)) {
      const md = (_R = db.find("Medias", r[1])) != null ? _R : fail(404, "Image introuvable.");
      const previousUrl = md.url;
      Object.assign(md, storeImage(body.file), { original_name: String(body.file.name).slice(0, 200), width: (_S = body.file.width) != null ? _S : null, height: (_T = body.file.height) != null ? _T : null });
      db.touch("Medias");
      return { ...md, previousUrl };
    }
    if (r = m(/^\/api\/admin\/media\/(\d+)$/)) {
      const md = (_U = db.find("Medias", r[1])) != null ? _U : fail(404, "Image introuvable.");
      if (method === "DELETE") {
        try {
          DriveApp.getFileById(md.file_id).setTrashed(true);
        } catch {
        }
        db.set("Medias", db.all("Medias").filter((x) => x.id !== md.id));
        audit(c, "media.delete", "media", md.id);
        return { ok: true };
      }
      md.alt_text = String((_V = body.alt) != null ? _V : "").slice(0, 300);
      db.touch("Medias");
      return md;
    }
    if (p === "/api/admin/audience/count") return { count: eligible(db, body.audience).length };
    const campaignFields = (b2) => {
      var _a2, _b2, _c2, _d2;
      if (!String((_a2 = b2.name) != null ? _a2 : "").trim()) fail(400, "Nom interne obligatoire");
      if (!String((_b2 = b2.subject) != null ? _b2 : "").trim()) fail(400, "Objet obligatoire");
      if (!isEmail(b2.fromEmail) || !/@sanctimaps\.fr$/i.test(b2.fromEmail)) fail(400, "L'adresse d'expédition doit appartenir au domaine sanctimaps.fr.");
      if (b2.replyTo && !isEmail(b2.replyTo)) fail(400, "Adresse de réponse invalide.");
      return { name: String(b2.name).slice(0, 150), subject: String(b2.subject).slice(0, 200), preheader: b2.preheader ? String(b2.preheader).slice(0, 200) : null, from_name: String(b2.fromName || "SanctiMaps").slice(0, 100), from_email: String(b2.fromEmail).toLowerCase(), reply_to: b2.replyTo || null, newsletter_id: (_c2 = b2.newsletterId) != null ? _c2 : null, design: checkDesign(b2.design), audience: (_d2 = b2.audience) != null ? _d2 : { type: "all" }, track_opens: false };
    };
    if (p === "/api/admin/campaigns") {
      if (method === "GET") {
        let rows = db.all("Campagnes");
        if (q.status) rows = rows.filter((x) => String(q.status).split(",").includes(x.status));
        if (q.from) rows = rows.filter((x) => x.created_at >= q.from);
        if (q.to) rows = rows.filter((x) => x.created_at <= `${q.to}T23:59:59`);
        return [...rows].sort((a, b2) => {
          var _a2, _b2;
          return String((_a2 = b2.scheduled_at) != null ? _a2 : b2.created_at).localeCompare(String((_b2 = a.scheduled_at) != null ? _b2 : a.created_at));
        }).map(({ design, ...x }) => {
          const st = campaignStats(db, x.id);
          return { ...x, accepted: st.accepted, bounced: st.bounced, clickers: st.unique_clickers };
        });
      }
      const cmp = db.insert("Campagnes", { ...campaignFields(body), status: "draft", scheduled_at: null, timezone: "Europe/Paris", started_at: null, finished_at: null, recipient_count: null, created_at: now(), updated_at: now() });
      audit(c, "campaign.create", "campaign", cmp.id);
      return cmp;
    }
    if (r = m(/^\/api\/admin\/campaigns\/(\d+)\/(test|send|cancel|unschedule|duplicate|recipients)$/)) {
      const cmp = (_W = db.find("Campagnes", r[1])) != null ? _W : fail(404, "Campagne introuvable.");
      switch (r[2]) {
        case "recipients": {
          let rows = db.all("Destinataires").filter((x) => x.campaign_id === cmp.id);
          if (q.status) rows = rows.filter((x) => x.status === q.status);
          const page = Math.max(1, Number((_X = q.page) != null ? _X : 1));
          return { rows: rows.slice((page - 1) * 50, page * 50), total: rows.length };
        }
        case "duplicate":
          return db.insert("Campagnes", { ...clone(cmp), id: null, name: `${cmp.name} (copie)`, status: "draft", scheduled_at: null, started_at: null, finished_at: null, recipient_count: null, created_at: now(), updated_at: now() });
        case "test": {
          const to = String((_Y = body.to) != null ? _Y : "").trim().toLowerCase();
          if (!isEmail(to)) fail(400, "Adresse de test invalide.");
          const allowed = [...db.all("Comptes").map((u) => u.email), accountEmail().toLowerCase(), settings.organization.contactEmail, settings.sender.replyTo, settings.sender.fromEmail].filter(Boolean).map((x) => String(x).toLowerCase());
          if (!allowed.includes(to)) fail(400, "Le test ne peut être envoyé qu'à une adresse contrôlée : un compte du studio, votre Gmail, l'adresse de contact ou d'expédition.");
          const out = sendMail(db, { to, subject: `[TEST] ${cmp.subject}`, ...renderForRecipient(db, cmp, { id: 0, first_name: "Testeur" }), fromName: cmp.from_name, fromEmail: cmp.from_email, replyTo: (_Z = cmp.reply_to) != null ? _Z : void 0, kind: "test", campaignId: cmp.id, headers: { "X-SanctiMaps-Test": "true" } });
          if (out.status === "accepted") saveSettings({ ...settings, testEmail: { sentAt: now(), to } });
          audit(c, "campaign.test", "campaign", cmp.id, { to, status: out.status });
          return { ...out, sandbox: false };
        }
        case "send": {
          if (body.confirm !== true) fail(400, "Confirmation explicite requise.");
          if (!settings.realSendingEnabled) fail(412, "Les envois réels ne sont pas encore activés : vérifiez l'adresse d'expédition, SPF, DKIM, DMARC, envoyez un e-mail de test et relisez la politique de confidentialité (Paramètres → Envoi).");
          if (!["draft", "scheduled", "cancelled"].includes(cmp.status)) fail(409, `Impossible : la campagne est « ${cmp.status} ».`);
          const n = eligible(db, cmp.audience).length;
          if (!n) fail(400, "Aucun destinataire éligible (abonnés confirmés uniquement).");
          if (body.mode === "schedule") {
            const when = new Date(body.scheduledAt);
            if (isNaN(+when) || +when < Date.now() + 6e4) fail(400, "La date programmée doit être dans le futur (au moins 1 minute).");
            Object.assign(cmp, { status: "scheduled", scheduled_at: when.toISOString(), timezone: body.timezone || "Europe/Paris", updated_at: now() });
          } else Object.assign(cmp, { status: "queued", scheduled_at: now(), timezone: body.timezone || "Europe/Paris", updated_at: now() });
          db.touch("Campagnes");
          audit(c, body.mode === "schedule" ? "campaign.schedule" : "campaign.send_now", "campaign", cmp.id, { recipients: n });
          return { campaign: cmp, recipients: n };
        }
        case "cancel": {
          if (["scheduled", "queued"].includes(cmp.status)) cmp.status = "cancelled";
          else if (cmp.status === "sending") {
            for (const x of db.all("Destinataires")) if (x.campaign_id === cmp.id && x.status === "pending") {
              x.status = "skipped";
              x.last_error = "Envoi interrompu par l'administrateur";
            }
            db.touch("Destinataires");
            cmp.status = "cancelled";
            cmp.finished_at = now();
          } else fail(409, `Une campagne « ${cmp.status} » ne peut pas être annulée.`);
          cmp.updated_at = now();
          db.touch("Campagnes");
          audit(c, "campaign.cancel", "campaign", cmp.id);
          return cmp;
        }
        case "unschedule":
          if (cmp.status !== "scheduled") fail(409, "Cette campagne n'est pas programmée.");
          cmp.status = "draft";
          db.touch("Campagnes");
          return cmp;
      }
    }
    if (r = m(/^\/api\/admin\/campaigns\/(\d+)$/)) {
      const cmp = (__ = db.find("Campagnes", r[1])) != null ? __ : fail(404, "Campagne introuvable.");
      if (method === "GET") return { campaign: cmp, stats: campaignStats(db, cmp.id) };
      if (method === "DELETE") {
        if (!["draft", "cancelled"].includes(cmp.status) || cmp.started_at) fail(409, "Seuls les brouillons jamais envoyés peuvent être supprimés.");
        db.set("Campagnes", db.all("Campagnes").filter((x) => x.id !== cmp.id));
        audit(c, "campaign.delete", "campaign", cmp.id);
        return { ok: true };
      }
      if (!["draft", "scheduled", "cancelled"].includes(cmp.status)) fail(409, "Une campagne en cours ou envoyée ne peut plus être modifiée.");
      Object.assign(cmp, campaignFields(body), { status: "draft", updated_at: now() });
      db.touch("Campagnes");
      return cmp;
    }
    if (p === "/api/admin/automations") return { automations: db.all("Automatisations"), runs: [...db.all("Executions")].reverse().slice(0, 50) };
    if (r = m(/^\/api\/admin\/automations\/(\w+)$/)) {
      need(c, "admin");
      const a = (_$ = db.all("Automatisations").find((x) => x.key === r[1])) != null ? _$ : fail(404, "Automatisation inconnue.");
      a.enabled = Boolean(body.enabled);
      a.config = (_aa = body.config) != null ? _aa : a.config;
      db.touch("Automatisations");
      audit(c, a.enabled ? "automation.enable" : "automation.disable", "automation", a.key);
      return a;
    }
    if (p === "/api/admin/settings" && method === "GET") {
      const al = aliases();
      const quota = googleQuota();
      return {
        settings,
        sandbox: false,
        publicUrl: siteUrl(),
        scriptUrl: scriptUrl(),
        siteKey: "",
        bounceWebhookConfigured: true,
        backend: "google",
        smtp: { mode: "google", account: accountEmail(), aliases: al, fromAllowed: canSendAs(settings.sender.fromEmail), gmailApi: gmailApiAvailable(), remainingQuota: quota, sentToday: sentToday(db), maxPerDay: settings.sending.maxPerDay }
      };
    }
    if (p === "/api/admin/settings/smtp/verify") {
      need(c, "admin");
      const okAlias = canSendAs(settings.sender.fromEmail);
      const message = okAlias ? `L'adresse ${settings.sender.fromEmail} est bien configurée dans Gmail « Envoyer des e-mails en tant que » (compte ${accountEmail()}).` : `L'adresse ${settings.sender.fromEmail} n'est pas encore configurée dans Gmail : Paramètres Gmail → Comptes → « Envoyer des e-mails en tant que » (serveur smtp.ionos.fr).`;
      saveSettings({ ...settings, smtpCheck: { ok: okAlias, checkedAt: now(), message } });
      return { ok: okAlias, message };
    }
    if (p === "/api/admin/settings/domain/check") {
      need(c, "admin");
      const d = checkDomain(settings.sender.fromEmail, settings.dkimSelector);
      saveSettings({ ...settings, domainCheck: { checkedAt: d.checkedAt, spf: d.spf, dkim: d.dkim, dmarc: d.dmarc, details: d.details } });
      audit(c, "settings.domain_check", "settings", d.domain);
      return d;
    }
    if (p === "/api/admin/settings/real-sending") {
      need(c, "admin");
      if (body.enabled) {
        const missing = [!settings.smtpCheck.ok && "adresse d'expédition configurée dans Gmail", !settings.domainCheck.spf && "SPF", !settings.domainCheck.dkim && "DKIM", !settings.domainCheck.dmarc && "DMARC", !settings.testEmail.sentAt && "e-mail de test accepté", !settings.privacyPolicy.reviewed && "politique de confidentialité relue"].filter(Boolean);
        if (missing.length) fail(412, `Vérifications manquantes : ${missing.join(", ")}.`);
      }
      saveSettings({ ...settings, realSendingEnabled: Boolean(body.enabled) });
      audit(c, body.enabled ? "settings.real_sending_on" : "settings.real_sending_off", "settings", "sending");
      return { ok: true, enabled: Boolean(body.enabled) };
    }
    if (p === "/api/admin/settings/dns-guide") return { domain: "sanctimaps.fr", records: [
      { type: "CNAME", name: "newsletter", value: "sanctimaps-gif.github.io", purpose: "Sous-domaine du studio, servi par GitHub Pages (ne touche pas sanctimaps.fr ni www)." },
      { type: "TXT", name: "@", value: "v=spf1 include:_spf-eu.ionos.com ~all (valeur exacte à vérifier dans la zone IONOS)", purpose: "SPF : un seul enregistrement v=spf1 ; IONOS le crée en général avec la boîte mail." },
      { type: "CNAME / TXT", name: `${settings.dkimSelector || "<sélecteur>"}._domainkey`, value: "fourni par IONOS (signature DKIM de la messagerie)", purpose: "DKIM : signature des messages envoyés par le SMTP IONOS." },
      { type: "TXT", name: "_dmarc", value: `v=DMARC1; p=none; rua=mailto:${settings.sender.fromEmail}; adkim=r; aspf=r`, purpose: "DMARC : commencer en p=none, durcir après quelques semaines." }
    ] };
    if (r = m(/^\/api\/admin\/settings\/(\w+)$/)) {
      need(c, "admin");
      const section = r[1];
      if (!(section in DEFAULT_SETTINGS2) || ["smtpCheck", "domainCheck", "testEmail", "realSendingEnabled"].includes(section)) fail(404, "Section inconnue.");
      if (section === "sender" && (!isEmail(body.fromEmail) || !/@sanctimaps\.fr$/i.test(body.fromEmail))) fail(400, "L'adresse doit appartenir au domaine sanctimaps.fr.");
      const next = { ...settings, [section]: body };
      if (section === "sender") next.realSendingEnabled = false;
      saveSettings(next);
      audit(c, "settings.update", "settings", section);
      return next;
    }
    if (p === "/api/admin/logs/email") return [...db.all("Journal")].reverse().slice(0, 100).map((l) => ({ ...l, sandbox: false }));
    if (p === "/api/admin/logs/audit") {
      need(c, "admin");
      const users = new Map(db.all("Comptes").map((u) => [u.id, u.display_name]));
      return [...db.all("Audit")].reverse().slice(0, 200).map((a) => {
        var _a2;
        return { ...a, display_name: (_a2 = users.get(a.user_id)) != null ? _a2 : null };
      });
    }
    if (p === "/api/admin/jobs") {
      const hb = props().getProperty("HEARTBEAT");
      const rs = db.all("Destinataires");
      const counts = ["pending", "sending", "accepted", "bounced", "failed", "uncertain"].map((s) => ({ job_type: "destinataires", status: s, n: rs.filter((x) => x.status === s).length })).filter((x) => x.n);
      return { counts, workerHeartbeat: hb ? JSON.parse(hb) : null };
    }
    if (p === "/api/admin/users") {
      need(c, "admin");
      if (method === "GET") return db.all("Comptes").map((u2) => ({ id: u2.id, email: u2.email, display_name: u2.display_name, role: u2.role, totp_enabled: u2.totp_enabled, last_login_at: u2.last_login_at, created_at: u2.created_at }));
      if (!isEmail(body.email)) fail(400, "Adresse invalide.");
      if (db.all("Comptes").some((u2) => u2.email === String(body.email).toLowerCase())) fail(409, "Ce compte existe déjà.");
      if (!["admin", "editor", "viewer"].includes(body.role)) fail(400, "Rôle invalide.");
      const u = db.insert("Comptes", { email: String(body.email).toLowerCase(), display_name: (_ba = cleanName(body.displayName)) != null ? _ba : "Utilisateur", role: body.role, password_hash: hashPassword(passwordOk(body.password)), totp_secret: null, totp_enabled: false, failed_logins: 0, locked_until: null, last_login_at: null, created_at: now() });
      audit(c, "user.create", "user", u.id, { role: u.role });
      return { id: u.id, email: u.email, display_name: u.display_name, role: u.role };
    }
    if (r = m(/^\/api\/admin\/users\/(\d+)$/)) {
      need(c, "admin");
      if (Number(r[1]) === c.user.id) fail(400, "Vous ne pouvez pas supprimer votre propre compte.");
      db.set("Comptes", db.all("Comptes").filter((u) => u.id !== Number(r[1])));
      audit(c, "user.delete", "user", r[1]);
      return { ok: true };
    }
    if (p === "/api/admin/profile") {
      c.user.display_name = (_ca = cleanName(body.displayName)) != null ? _ca : c.user.display_name;
      db.touch("Comptes");
      return { ok: true };
    }
    return fail(404, "Introuvable.");
  }
  function seed(db) {
    if (!db.all("Modeles").some((t) => t.is_system)) for (const t of starterTemplates()) db.insert("Modeles", { name: t.name, description: t.description, category: t.category, is_system: true, design: t.design, created_at: now(), updated_at: now() });
    const autos = db.all("Automatisations");
    for (const a of DEFAULT_AUTOMATIONS) if (!autos.some((x) => x.key === a.key)) db.insert("Automatisations", clone(a));
  }

  // google/src/jobs.ts
  var now2 = () => (/* @__PURE__ */ new Date()).toISOString();
  var MAX_RUN_MS = 4.5 * 60 * 1e3;
  function withLock(fn) {
    const lock = LockService.getScriptLock();
    lock.waitLock(3e4);
    try {
      const db = new Db(openBook());
      const r = fn(db);
      db.flush();
      SpreadsheetApp.flush();
      return r;
    } finally {
      lock.releaseLock();
    }
  }
  function processQueue(started = Date.now()) {
    withLock((db) => {
      for (const c of db.all("Campagnes")) {
        if (c.status === "scheduled" && new Date(c.scheduled_at) <= /* @__PURE__ */ new Date()) {
          c.status = "queued";
          c.updated_at = now2();
          db.touch("Campagnes");
        }
        if (c.status === "queued") prepareCampaign(db, c);
      }
      for (const r of db.all("Destinataires")) {
        if (r.status === "sending" && +new Date(r.updated_at) < Date.now() - 15 * 6e4) {
          r.status = "uncertain";
          r.last_error = "Interruption pendant l'envoi : statut inconnu, non renvoyé pour éviter un doublon";
          r.updated_at = now2();
          db.touch("Destinataires");
        }
      }
    });
    const settings = getSettings();
    let sent = 0;
    while (Date.now() - started < MAX_RUN_MS) {
      const batch = withLock((db) => {
        var _a, _b;
        const budget = Math.min(settings.sending.maxPerDay - sentToday(db), (_a = googleQuota()) != null ? _a : Infinity, settings.sending.batchSize);
        if (budget <= 0) return [];
        const sending = new Set(db.all("Campagnes").filter((c) => c.status === "sending").map((c) => c.id));
        const picked = db.all("Destinataires").filter((r) => sending.has(r.campaign_id) && r.status === "pending").slice(0, budget);
        for (const r of picked) {
          r.status = "sending";
          r.attempts = ((_b = r.attempts) != null ? _b : 0) + 1;
          r.updated_at = now2();
        }
        if (picked.length) db.touch("Destinataires");
        return picked.map((r) => r.id);
      });
      if (!batch.length) break;
      withLock((db) => {
        var _a;
        for (const id of batch) {
          const r = db.find("Destinataires", id);
          const camp = db.find("Campagnes", r.campaign_id);
          const sub = db.find("Abonnes", r.subscriber_id);
          if (!sub || sub.status !== "confirmed") {
            r.status = (sub == null ? void 0 : sub.status) === "unsubscribed" ? "unsubscribed" : "skipped";
            r.last_error = "Exclu : abonné non confirmé au moment de l'envoi";
            db.touch("Destinataires");
            continue;
          }
          const html = renderForRecipient(db, camp, sub, r);
          const out = sendMail(db, { to: sub.email, subject: camp.subject, html: html.html, text: html.text, fromName: camp.from_name, fromEmail: camp.from_email, replyTo: (_a = camp.reply_to) != null ? _a : void 0, headers: listUnsubscribeHeaders(sub.id, camp.id), kind: "campaign", campaignId: camp.id });
          r.updated_at = now2();
          if (out.status === "accepted") {
            r.status = "accepted";
            r.message_id = out.messageId;
            r.sent_at = now2();
            r.last_error = null;
            db.insert("Evenements", { campaign_id: camp.id, recipient_id: r.id, subscriber_id: sub.id, event_type: "accepted", link_id: null, detail: null, created_at: now2() });
            sent++;
          } else if (out.status === "hard_bounce") applyDeliveryEvent(db, "hard_bounce", sub.email, out.error, r);
          else if (out.status === "quota") {
            r.status = "pending";
            r.attempts -= 1;
            r.last_error = "Quota Gmail du jour atteint : reprise demain";
          } else if (r.attempts < settings.sending.maxAttempts) {
            r.status = "pending";
            r.last_error = out.error;
          } else {
            r.status = "failed";
            r.last_error = out.error;
            db.insert("Evenements", { campaign_id: camp.id, recipient_id: r.id, subscriber_id: sub.id, event_type: "failed", link_id: null, detail: { error: out.error }, created_at: now2() });
          }
          db.touch("Destinataires");
        }
      });
    }
    withLock((db) => {
      for (const c of db.all("Campagnes").filter((x) => x.status === "sending")) {
        const left = db.all("Destinataires").some((r) => r.campaign_id === c.id && (r.status === "pending" || r.status === "sending"));
        if (!left) {
          c.status = "sent";
          c.finished_at = now2();
          c.updated_at = now2();
          db.touch("Campagnes");
        }
      }
    });
    scanBounces();
    const day = now2().slice(0, 10);
    if (props().getProperty("LAST_DAILY") !== day) {
      daily();
      props().setProperty("LAST_DAILY", day);
    }
    props().setProperty("HEARTBEAT", JSON.stringify({ at: now2(), workerId: "Déclencheur Google (5 min)", sandbox: false }));
    return { sent };
  }
  function scanBounces() {
    var _a;
    let threads = [];
    try {
      threads = GmailApp.search("from:(mailer-daemon OR postmaster) newer_than:7d -label:newsletter-rebonds-traites", 0, 50);
    } catch {
      return 0;
    }
    if (!threads.length) return 0;
    const label = (_a = GmailApp.getUserLabelByName("newsletter-rebonds-traites")) != null ? _a : GmailApp.createLabel("newsletter-rebonds-traites");
    let n = 0;
    withLock((db) => {
      var _a2, _b, _c, _d;
      const byEmail = new Map(db.all("Abonnes").map((s) => [s.email, s]));
      for (const t of threads) {
        for (const msg of t.getMessages()) {
          const body = String((_a2 = msg.getPlainBody()) != null ? _a2 : "");
          const failed = String((_c = (_b = msg.getHeader) == null ? void 0 : _b.call(msg, "X-Failed-Recipients")) != null ? _c : "").toLowerCase().split(/[,\s]+/).filter(Boolean);
          const candidates = failed.length ? failed : [...new Set((_d = body.toLowerCase().match(/[^\s<>()"',;:]+@[^\s<>()"',;:]+\.[a-z]{2,}/g)) != null ? _d : [])].filter((e) => byEmail.has(e));
          const hard = /\b5\.\d\.\d+\b|\b55\d\b|does not exist|user unknown|address not found|n'existe pas|introuvable|no such user/i.test(body);
          for (const email of candidates) {
            if (!byEmail.has(email)) continue;
            const rcpt = db.all("Destinataires").filter((r) => r.email === email && r.status === "accepted").sort((a, b2) => String(b2.sent_at).localeCompare(String(a.sent_at)))[0];
            applyDeliveryEvent(db, hard ? "hard_bounce" : "soft_bounce", email, body.slice(0, 300), rcpt);
            n++;
          }
        }
        t.addLabel(label);
      }
    });
    return n;
  }
  function daily() {
    withLock((db) => {
      var _a, _b, _c, _d;
      const autos = db.all("Automatisations");
      const log = (key, status, detail) => db.insert("Executions", { automation_key: key, status, detail, created_at: now2() });
      const purge = autos.find((a) => a.key === "purge_unconfirmed" && a.enabled);
      if (purge) {
        const limit = Date.now() - Number((_a = purge.config.days) != null ? _a : 30) * 864e5;
        const before = db.all("Abonnes").length;
        const keep = db.all("Abonnes").filter((s2) => !(s2.status === "pending" && !s2.confirmed_at && +new Date(s2.created_at) < limit));
        db.set("Abonnes", keep);
        log("purge_unconfirmed", "ok", { deleted: before - keep.length });
      }
      const inactive = autos.find((a) => a.key === "inactive_subscribers" && a.enabled);
      if (inactive) {
        const limit = Date.now() - Number((_b = inactive.config.months) != null ? _b : 12) * 30 * 864e5;
        const n = db.all("Abonnes").filter((s2) => s2.status === "confirmed" && +new Date(s2.confirmed_at) < limit && (!s2.last_activity_at || +new Date(s2.last_activity_at) < limit)).length;
        log("inactive_subscribers", "ok", { inactive: n, note: "Signalement uniquement" });
      }
      const reminder = autos.find((a) => a.key === "editorial_reminder" && a.enabled);
      if (reminder) {
        const days = Number((_c = reminder.config.days) != null ? _c : 7);
        const recent = db.all("Campagnes").some((c) => ["scheduled", "queued", "sending"].includes(c.status) || c.status === "sent" && +new Date(c.finished_at) > Date.now() - days * 864e5);
        const to = String(reminder.config.to || "") || ((_d = db.all("Comptes").find((u) => u.role === "admin")) == null ? void 0 : _d.email);
        if (!recent && to) {
          transactional(db, to, "Rappel : aucune lettre programmée", [["heading", { text: "Aucune lettre programmée", fontSize: 24 }], ["text", { text: `Aucune lettre n'a été envoyée ni programmée depuis ${days} jours.` }]], "admin_notification");
          log("editorial_reminder", "ok", { to });
        } else log("editorial_reminder", "skipped", { reason: recent ? "Lettre programmée ou récente" : "Aucun destinataire" });
      }
      const s = getSettings();
      const keepLogs = Date.now() - s.retention.logsMonths * 30 * 864e5;
      db.set("Journal", db.all("Journal").filter((l) => +new Date(l.created_at) > keepLogs));
      db.set("Jetons", db.all("Jetons").filter((t) => +new Date(t.expires_at) > Date.now() - 7 * 864e5));
    });
  }

  // google/src/main.ts
  var json = (v) => ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);
  function doPost(e) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (((_a = e == null ? void 0 : e.parameter) == null ? void 0 : _a.action) === "unsubscribe") {
      const id = readUnsubscribeToken(e.parameter.t);
      if (id) withDb((db) => unsubscribe(db, id, "one-click"));
      return ContentService.createTextOutput(id ? "OK" : "Lien invalide");
    }
    let req;
    try {
      req = JSON.parse((_c = (_b = e == null ? void 0 : e.postData) == null ? void 0 : _b.contents) != null ? _c : "{}");
    } catch {
      return json({ ok: false, status: 400, error: "Requête illisible." });
    }
    const method = String((_d = req.method) != null ? _d : "GET").toUpperCase();
    const path = String((_e = req.path) != null ? _e : "");
    if (!path.startsWith("/api/") || path.length > 500) return json({ ok: false, status: 404, error: "Introuvable." });
    try {
      const data = withDb((db) => {
        var _a2, _b2, _c2;
        const user = req.token ? authenticate(db, String(req.token)) : null;
        return route({ db, user, userAgent: String((_a2 = req.userAgent) != null ? _a2 : "") }, method, path, { ...(_b2 = req.body) != null ? _b2 : {}, __token: (_c2 = req.token) != null ? _c2 : null });
      });
      return json({ ok: true, data });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : (_f = err == null ? void 0 : err.status) != null ? _f : 500;
      if (status >= 500) console.error((_g = err == null ? void 0 : err.stack) != null ? _g : err);
      return json({ ok: false, status, error: status >= 500 ? "Erreur interne du script." : err.message });
    }
  }
  function doGet(e) {
    var _a;
    if (((_a = e == null ? void 0 : e.parameter) == null ? void 0 : _a.action) === "unsubscribe") {
      return HtmlService.createHtmlOutput('<p style="font-family:Georgia,serif">Pour vous désinscrire, utilisez le lien « Se désinscrire » en bas de la lettre.</p>');
    }
    return json({ ok: true, service: "SanctiMaps Newsletter Studio", time: (/* @__PURE__ */ new Date()).toISOString() });
  }
  function withDb(fn) {
    const lock = LockService.getScriptLock();
    lock.waitLock(3e4);
    try {
      const db = new Db(openBook());
      const r = fn(db);
      db.flush();
      return r;
    } finally {
      lock.releaseLock();
    }
  }
  function installer() {
    var _a;
    const p = props();
    const book = SpreadsheetApp.getActiveSpreadsheet();
    if (!book) throw new Error("Ouvrez ce script depuis le tableur (Extensions → Apps Script).");
    p.setProperty("SPREADSHEET_ID", book.getId());
    if (!p.getProperty("SECRET")) p.setProperty("SECRET", randomToken() + randomToken());
    if (!p.getProperty("SITE_URL")) p.setProperty("SITE_URL", "https://sanctimaps-gif.github.io/Newslatter/");
    const code = randomToken().slice(0, 10).toUpperCase();
    p.setProperty("SETUP_CODE", code);
    withDb((db) => {
      seed(db);
      for (const t of ["Abonnes", "Consentements", "Jetons", "Exclusions", "Newsletters", "Segments", "Campagnes", "Destinataires", "Liens", "Evenements", "Journal", "Medias", "Comptes", "Executions", "Audit"]) db.all(t);
    });
    for (const tr of ScriptApp.getProjectTriggers()) if (tr.getHandlerFunction() === "traiterFile") ScriptApp.deleteTrigger(tr);
    ScriptApp.newTrigger("traiterFile").timeBased().everyMinutes(5).create();
    const def = (_a = book.getSheetByName("Feuille 1")) != null ? _a : book.getSheetByName("Sheet1");
    if (def && def.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(def);
    Logger.log(`✅ Installation terminée.

CODE D'INSTALLATION : ${code}

Puis : Déployer → Nouveau déploiement → Application Web (Exécuter en tant que : moi ; Accès : tout le monde).`);
    return code;
  }
  function traiterFile() {
    return processQueue();
  }
  function utiliserSousDomaine() {
    props().setProperty("SITE_URL", "https://newsletter.sanctimaps.fr/");
    Logger.log("Adresse du site : https://newsletter.sanctimaps.fr/");
  }
  return __toCommonJS(main_exports);
})();
