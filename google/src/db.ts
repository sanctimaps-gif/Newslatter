// « Base de données » : un onglet par table dans le tableur privé de l'administrateur.
// Chaque requête charge les tables nécessaires, puis réécrit celles qui ont changé (sous verrou).

export const SCHEMAS: Record<string, string[]> = {
  Abonnes: ['id', 'email', 'first_name', 'last_name', 'status', 'source', 'tags', 'subscribed_at', 'confirmed_at', 'unsubscribed_at', 'bounce_count', 'last_activity_at', 'anonymized_at', 'notes', 'created_at'],
  Consentements: ['id', 'subscriber_id', 'action', 'consent_text', 'source', 'user_agent', 'created_at'],
  Jetons: ['id', 'subscriber_id', 'token_hash', 'expires_at', 'used_at', 'created_at'],
  Exclusions: ['email_hash', 'reason', 'created_at'],
  Newsletters: ['id', 'title', 'design', 'template_id', 'created_at', 'updated_at'],
  Modeles: ['id', 'name', 'description', 'category', 'is_system', 'design', 'created_at', 'updated_at'],
  Segments: ['id', 'name', 'rules', 'created_at'],
  Campagnes: ['id', 'name', 'subject', 'preheader', 'from_name', 'from_email', 'reply_to', 'newsletter_id', 'design', 'audience', 'status', 'scheduled_at', 'timezone', 'started_at', 'finished_at', 'recipient_count', 'track_opens', 'created_at', 'updated_at'],
  Destinataires: ['id', 'campaign_id', 'subscriber_id', 'email', 'status', 'attempts', 'message_id', 'last_error', 'sent_at', 'updated_at'],
  Liens: ['id', 'campaign_id', 'url'],
  Evenements: ['id', 'campaign_id', 'recipient_id', 'subscriber_id', 'event_type', 'link_id', 'detail', 'created_at'],
  Journal: ['id', 'kind', 'to_email', 'subject', 'campaign_id', 'status', 'message_id', 'error', 'created_at'],
  Medias: ['id', 'file_id', 'filename', 'original_name', 'url', 'mime_type', 'size_bytes', 'width', 'height', 'alt_text', 'created_at'],
  Comptes: ['id', 'email', 'display_name', 'role', 'password_hash', 'totp_secret', 'totp_enabled', 'failed_logins', 'locked_until', 'last_login_at', 'created_at'],
  Automatisations: ['key', 'name', 'description', 'enabled', 'config'],
  Executions: ['id', 'automation_key', 'status', 'detail', 'created_at'],
  Audit: ['id', 'user_id', 'action', 'entity', 'entity_id', 'detail', 'created_at'],
};
export type TableName = keyof typeof SCHEMAS;

/** Encodage d'une cellule : jamais interprétable comme formule ni convertie en date par Sheets. */
export function encodeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return /^[=+\-@'"[{\d\s]|^(true|false|null)$|^$/.test(v) ? JSON.stringify(v) : v;
  return JSON.stringify(v);
}
export function decodeCell(c: unknown): any {
  if (c === '' || c === null || c === undefined) return null;
  if (typeof c !== 'string') return c;
  if (/^["[{]/.test(c) || /^-?\d+(\.\d+)?$/.test(c) || /^(true|false|null)$/.test(c)) { try { return JSON.parse(c); } catch { return c; } }
  return c;
}

const MAX_CELL = 49000;

export class Db {
  private cache = new Map<string, any[]>();
  private dirty = new Set<string>();
  constructor(private book: any) {}

  sheet(name: string) {
    let sh = this.book.getSheetByName(name);
    if (!sh) {
      sh = this.book.insertSheet(name);
      const cols = SCHEMAS[name];
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
      sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
      sh.setFrozenRows(1);
    }
    return sh;
  }

  all(name: TableName): any[] {
    if (this.cache.has(name)) return this.cache.get(name)!;
    const sh = this.sheet(name);
    const cols = SCHEMAS[name];
    const last = sh.getLastRow();
    const values: any[][] = last > 1 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [];
    const rows = values.filter((r) => r.some((c) => c !== '' && c !== null)).map((r) => Object.fromEntries(cols.map((k, i) => [k, decodeCell(r[i])])));
    this.cache.set(name, rows);
    return rows;
  }

  set(name: TableName, rows: any[]) { this.cache.set(name, rows); this.dirty.add(name); }
  touch(name: TableName) { this.dirty.add(name); }

  insert(name: TableName, row: any) {
    const rows = this.all(name);
    if (SCHEMAS[name].includes('id') && row.id == null) row.id = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
    rows.push(row); this.dirty.add(name);
    return row;
  }

  find(name: TableName, id: number | string) { return this.all(name).find((r) => String(r.id) === String(id)) ?? null; }

  flush() {
    for (const name of this.dirty) {
      const sh = this.sheet(name);
      const cols = SCHEMAS[name];
      const rows = this.cache.get(name) ?? [];
      const values = rows.map((r) => cols.map((k) => {
        const v = encodeCell(r[k]);
        if (v.length > MAX_CELL) throw Object.assign(new Error('Contenu trop volumineux pour être enregistré (limite Google Sheets).'), { status: 400 });
        return v;
      }));
      const last = sh.getLastRow();
      if (last > 1) sh.getRange(2, 1, last - 1, cols.length).clearContent();
      if (values.length) {
        if (sh.getMaxRows() < values.length + 1) sh.insertRowsAfter(sh.getMaxRows(), values.length + 1 - sh.getMaxRows());
        const range = sh.getRange(2, 1, values.length, cols.length);
        range.setNumberFormat('@');
        range.setValues(values);
      }
    }
    this.dirty.clear();
  }
}

export function openBook() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
