// Dates, fuseaux horaires et libellés.
export const TIMEZONES = ['Europe/Paris', 'Europe/Brussels', 'Europe/Zurich', 'Europe/London', 'America/Montreal', 'America/Martinique', 'Indian/Reunion', 'Pacific/Noumea', 'Pacific/Tahiti', 'Africa/Dakar', 'Africa/Abidjan', 'UTC'];

export function fmtDate(d: string | Date | null | undefined, tz = 'Europe/Paris', withTime = true) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(+date)) return '—';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(date);
}

export function fmtRelative(d: string | null | undefined) {
  if (!d) return '—';
  const diff = (Date.now() - +new Date(d)) / 1000;
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  if (Math.abs(diff) < 60) return 'à l\'instant';
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (Math.abs(diff) < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  return fmtDate(d, undefined, false);
}

export const fmtNum = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('fr-FR').format(n));
export const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n)} %`);

function tzOffsetMs(utcMs: number, tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - utcMs;
}

/** « 2026-12-01 » + « 07:30 » dans le fuseau choisi → instant UTC (gère l'heure d'été). */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let guess = wall - tzOffsetMs(wall, tz);
  guess = wall - tzOffsetMs(guess, tz);
  return new Date(guess);
}

/** Instant UTC → { date, time } affichés dans le fuseau choisi. */
export function utcToZoned(d: string | Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente de confirmation', confirmed: 'Confirmé', unsubscribed: 'Désinscrit', bounced: 'Adresse en erreur', suspended: 'Suspendu',
};
export const CAMPAIGN_STATUS: Record<string, string> = {
  draft: 'Brouillon', scheduled: 'Programmée', queued: 'En file', sending: 'Envoi en cours', sent: 'Envoyée', cancelled: 'Annulée', failed: 'Échec', paused: 'En pause',
};
export const RECIPIENT_STATUS: Record<string, string> = {
  pending: 'En attente', sending: 'En cours', accepted: 'Accepté par le serveur d\'envoi', bounced: 'Rebond', failed: 'Échec', unsubscribed: 'Désinscription', skipped: 'Exclu', uncertain: 'Statut incertain (non renvoyé)',
};
