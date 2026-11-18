// Paramètres non secrets, stockés dans les propriétés du script (jamais dans le code).
import privacyMd from '../../database/seeds/politique-confidentialite.md';

export const props = () => PropertiesService.getScriptProperties();

export const DEFAULT_SETTINGS = {
  sender: { fromName: 'SanctiMaps', fromEmail: 'newsletter@sanctimaps.fr', replyTo: '' },
  organization: { name: 'SanctiMaps', legalText: 'SanctiMaps — la carte mondiale des saints · sanctimaps.fr', contactEmail: '', website: 'https://sanctimaps.fr/' },
  // Gmail gratuit via Apps Script : environ 100 destinataires par jour (quota Google).
  sending: { batchSize: 20, batchDelayMs: 0, maxPerHour: 100, maxAttempts: 3, maxPerDay: 100 },
  tracking: { clicks: true, opens: false },
  dkimSelector: '',
  smtpCheck: { ok: false, checkedAt: null as string | null, message: 'Jamais vérifié' },
  domainCheck: { checkedAt: null as string | null, spf: false, dkim: false, dmarc: false, details: {} as Record<string, string> },
  testEmail: { sentAt: null as string | null, to: null as string | null },
  realSendingEnabled: false,
  privacyPolicy: { markdown: '', reviewed: false },
  retention: { unconfirmedDays: 30, logsMonths: 24 },
  timezone: 'Europe/Paris',
};
export type Settings = typeof DEFAULT_SETTINGS;

export function getSettings(): Settings {
  const raw = props().getProperty('SETTINGS');
  const saved = raw ? JSON.parse(raw) : {};
  const out: any = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const [k, v] of Object.entries(saved)) out[k] = out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? { ...out[k], ...(v as object) } : v;
  if (!out.privacyPolicy.markdown) out.privacyPolicy.markdown = privacyMd;
  return out;
}
export function saveSettings(s: Settings) { props().setProperty('SETTINGS', JSON.stringify(s)); }

/** Adresse publique du studio (GitHub Pages, puis newsletter.sanctimaps.fr). */
export const siteUrl = () => (props().getProperty('SITE_URL') ?? 'https://sanctimaps-gif.github.io/Newslatter/').replace(/\/?$/, '/');
export const scriptUrl = () => props().getProperty('SCRIPT_URL') ?? (() => { try { return ScriptApp.getService().getUrl(); } catch { return ''; } })();
