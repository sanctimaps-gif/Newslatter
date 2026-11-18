// Point d'entrée Google Apps Script (application web + déclencheurs).
import { randomToken } from './crypto';
import { Db, openBook } from './db';
import { processQueue } from './jobs';
import { HttpError, authenticate, readUnsubscribeToken, route, seed, unsubscribe } from './router';
import { props } from './settings';

const json = (v: unknown) => ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);

/** Appels du site : POST { path, method, body, token } (en text/plain, sans pré-vérification CORS). */
export function doPost(e: any) {
  // Désinscription en un clic (RFC 8058) déclenchée par la messagerie du lecteur
  if (e?.parameter?.action === 'unsubscribe') {
    const id = readUnsubscribeToken(e.parameter.t);
    if (id) withDb((db) => unsubscribe(db, id, 'one-click'));
    return ContentService.createTextOutput(id ? 'OK' : 'Lien invalide');
  }
  let req: any;
  try { req = JSON.parse(e?.postData?.contents ?? '{}'); } catch { return json({ ok: false, status: 400, error: 'Requête illisible.' }); }
  const method = String(req.method ?? 'GET').toUpperCase();
  const path = String(req.path ?? '');
  if (!path.startsWith('/api/') || path.length > 500) return json({ ok: false, status: 404, error: 'Introuvable.' });
  try {
    const data = withDb((db) => {
      const user = req.token ? authenticate(db, String(req.token)) : null;
      return route({ db, user, userAgent: String(req.userAgent ?? '') }, method, path, { ...(req.body ?? {}), __token: req.token ?? null });
    });
    return json({ ok: true, data });
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : err?.status ?? 500;
    if (status >= 500) console.error(err?.stack ?? err);
    return json({ ok: false, status, error: status >= 500 ? 'Erreur interne du script.' : err.message });
  }
}

export function doGet(e: any) {
  if (e?.parameter?.action === 'unsubscribe') {
    return HtmlService.createHtmlOutput('<p style="font-family:Georgia,serif">Pour vous désinscrire, utilisez le lien « Se désinscrire » en bas de la lettre.</p>');
  }
  return json({ ok: true, service: 'SanctiMaps Newsletter Studio', time: new Date().toISOString() });
}

export function withDb<T>(fn: (db: Db) => T): T {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { const db = new Db(openBook()); const r = fn(db); db.flush(); return r; }
  finally { lock.releaseLock(); }
}

/** À exécuter une fois depuis l'éditeur Apps Script. Affiche le code d'installation dans le journal. */
export function installer() {
  const p = props();
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Ouvrez ce script depuis le tableur (Extensions → Apps Script).');
  p.setProperty('SPREADSHEET_ID', book.getId());
  if (!p.getProperty('SECRET')) p.setProperty('SECRET', randomToken() + randomToken());
  if (!p.getProperty('SITE_URL')) p.setProperty('SITE_URL', 'https://sanctimaps-gif.github.io/Newslatter/');
  const code = randomToken().slice(0, 10).toUpperCase();
  p.setProperty('SETUP_CODE', code);
  withDb((db) => {
    seed(db);
    for (const t of ['Abonnes', 'Consentements', 'Jetons', 'Exclusions', 'Newsletters', 'Segments', 'Campagnes', 'Destinataires', 'Liens', 'Evenements', 'Journal', 'Medias', 'Comptes', 'Executions', 'Audit'] as const) db.all(t);
  });
  for (const tr of ScriptApp.getProjectTriggers()) if (tr.getHandlerFunction() === 'traiterFile') ScriptApp.deleteTrigger(tr);
  ScriptApp.newTrigger('traiterFile').timeBased().everyMinutes(5).create();
  const def = book.getSheetByName('Feuille 1') ?? book.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(def);
  Logger.log(`✅ Installation terminée.\n\nCODE D'INSTALLATION : ${code}\n\nPuis : Déployer → Nouveau déploiement → Application Web (Exécuter en tant que : moi ; Accès : tout le monde).`);
  return code;
}

/** Déclencheur toutes les 5 minutes. */
export function traiterFile() { return processQueue(); }

/** Quand le sous-domaine est prêt : les liens des e-mails pointeront vers newsletter.sanctimaps.fr. */
export function utiliserSousDomaine() { props().setProperty('SITE_URL', 'https://newsletter.sanctimaps.fr/'); Logger.log('Adresse du site : https://newsletter.sanctimaps.fr/'); }
