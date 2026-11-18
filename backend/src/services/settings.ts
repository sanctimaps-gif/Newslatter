import { one, query } from '../lib/db.ts';

export interface AppSettings {
  sender: { fromName: string; fromEmail: string; replyTo: string };
  organization: { name: string; legalText: string; contactEmail: string; website: string };
  sending: { batchSize: number; batchDelayMs: number; maxPerHour: number; maxAttempts: number };
  tracking: { clicks: boolean; opens: boolean };
  dkimSelector: string;
  smtpCheck: { ok: boolean; checkedAt: string | null; message: string } ;
  domainCheck: { checkedAt: string | null; spf: boolean; dkim: boolean; dmarc: boolean; details: Record<string, string> };
  testEmail: { sentAt: string | null; to: string | null };
  realSendingEnabled: boolean;
  privacyPolicy: { markdown: string; reviewed: boolean };
  retention: { unconfirmedDays: number; logsMonths: number };
  timezone: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  sender: { fromName: 'SanctiMaps', fromEmail: 'newsletter@sanctimaps.fr', replyTo: '' },
  organization: { name: 'SanctiMaps', legalText: 'SanctiMaps — la carte mondiale des saints · sanctimaps.fr', contactEmail: '', website: 'https://sanctimaps.fr/' },
  sending: { batchSize: 50, batchDelayMs: 2000, maxPerHour: 1000, maxAttempts: 3 },
  tracking: { clicks: true, opens: false },
  dkimSelector: '',
  smtpCheck: { ok: false, checkedAt: null, message: 'Jamais vérifié' },
  domainCheck: { checkedAt: null, spf: false, dkim: false, dmarc: false, details: {} },
  testEmail: { sentAt: null, to: null },
  realSendingEnabled: false,
  privacyPolicy: { markdown: '', reviewed: false },
  retention: { unconfirmedDays: 30, logsMonths: 24 },
  timezone: 'Europe/Paris',
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await query<{ key: string; value: any }>('SELECT key, value FROM settings');
  const out: any = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) {
    if (r.key in out) out[r.key] = typeof out[r.key] === 'object' && out[r.key] !== null && !Array.isArray(out[r.key]) ? { ...out[r.key], ...r.value } : r.value;
  }
  return out as AppSettings;
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const r = await one<{ value: any }>('SELECT value FROM settings WHERE key = $1', [key]);
  const def = DEFAULT_SETTINGS[key];
  if (!r) return structuredClone(def);
  return (typeof def === 'object' && def !== null ? { ...def, ...r.value } : r.value) as AppSettings[K];
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  await query(`INSERT INTO settings(key, value, updated_at) VALUES ($1, $2, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [key, JSON.stringify(value)]);
}
