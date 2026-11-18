// Paramètres non secrets, stockés dans les propriétés du script (jamais dans le code).
import privacyMd from '../../database/seeds/politique-confidentialite.md';
import { accountEmail } from './mail';

export const props = () => PropertiesService.getScriptProperties();

export const DEFAULT_SETTINGS = {
  // Expéditeur par défaut : l'adresse Gmail qui fait tourner le script (aucune autre adresse nécessaire).
  sender: { fromName: 'SanctiMaps', fromEmail: '', replyTo: '' },
  organization: { name: 'SanctiMaps', legalText: 'SanctiMaps — la carte mondiale des saints · sanctimaps.fr', contactEmail: '', website: 'https://sanctimaps.fr/' },
  // Gmail gratuit via Apps Script : environ 100 destinataires par jour (quota Google).
  sending: { batchSize: 20, batchDelayMs: 0, maxPerHour: 100, maxAttempts: 3, maxPerDay: 100 },
  tracking: { clicks: true, opens: false },
  // Inscription directe par défaut (choix du propriétaire) ; la confirmation par e-mail reste activable.
  subscription: { doubleOptIn: false },
  dkimSelector: '',
  smtpCheck: { ok: false, checkedAt: null as string | null, message: 'Jamais vérifié' },
  domainCheck: { checkedAt: null as string | null, spf: false, dkim: false, dmarc: false, details: {} as Record<string, string> },
  testEmail: { sentAt: null as string | null, to: null as string | null },
  realSendingEnabled: true, // calculé : l'inverse de sendingPaused (gardé pour l'interface)
  sendingPaused: false,
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
  if (!out.sender.fromEmail) out.sender.fromEmail = accountEmail();
  out.realSendingEnabled = !out.sendingPaused;
  return out;
}
export function saveSettings(s: Settings) { props().setProperty('SETTINGS', JSON.stringify(s)); }

/** Adresse publique du studio (GitHub Pages, puis newsletter.sanctimaps.fr). */
export const siteUrl = () => (props().getProperty('SITE_URL') ?? 'https://sanctimaps-gif.github.io/Newslatter/').replace(/\/?$/, '/');
export const scriptUrl = () => props().getProperty('SCRIPT_URL') ?? (() => { try { return ScriptApp.getService().getUrl(); } catch { return ''; } })();
