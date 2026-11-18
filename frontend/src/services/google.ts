// Liaison entre le site (GitHub Pages) et le script Google privé de l'administrateur.
// Le script reçoit un POST en text/plain (pas de pré-vérification CORS) : { path, method, body, token }.
export const IS_GOOGLE = import.meta.env.VITE_BACKEND === 'google';

export interface SiteConfig { scriptUrl: string; siteUrl: string }
let config: SiteConfig | null = null;

export async function loadConfig(): Promise<SiteConfig> {
  if (config) return config;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-store' });
    config = r.ok ? await r.json() : { scriptUrl: '', siteUrl: '' };
  } catch { config = { scriptUrl: '', siteUrl: '' }; }
  return config!;
}
export const getConfig = () => config;

let token = '';
try { token = sessionStorage.getItem('snl.token') ?? ''; } catch { /* stockage indisponible */ }
export function setToken(t: string) {
  token = t;
  try { if (t) sessionStorage.setItem('snl.token', t); else sessionStorage.removeItem('snl.token'); } catch { /* */ }
}

function toBase64(buf: ArrayBuffer) {
  let s = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Optimisation des images dans le navigateur : 1200 px max, ré-encodage (supprime les métadonnées EXIF/GPS). */
async function optimiseImage(file: File): Promise<{ blob: Blob; width?: number; height?: number }> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { blob: file };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / bmp.width);
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.85));
    return { blob: blob ?? file, width: w, height: h };
  } catch { return { blob: file }; }
}

async function formToJson(form: FormData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (v instanceof File) {
      const isImage = v.type.startsWith('image/');
      const { blob, width, height } = isImage ? await optimiseImage(v) : { blob: v as Blob, width: undefined, height: undefined };
      if (blob.size > 5 * 1024 * 1024) throw Object.assign(new Error('Fichier trop lourd (5 Mo maximum).'), { status: 400 });
      out[k] = { name: v.name, type: blob.type || v.type, data: toBase64(await blob.arrayBuffer()), width, height };
    } else out[k] = v;
  }
  return out;
}

export async function googleCall(method: string, path: string, body?: unknown, form?: FormData) {
  const cfg = await loadConfig();
  if (!cfg.scriptUrl) throw Object.assign(new Error('Le studio n\'est pas encore relié au script Google (installation à terminer).'), { status: 503 });
  const payload = { path, method, body: form ? await formToJson(form) : body ?? {}, token, userAgent: navigator.userAgent.slice(0, 200) };
  let res: Response;
  try {
    res = await fetch(cfg.scriptUrl, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' });
  } catch {
    throw Object.assign(new Error('Le script Google est injoignable. Vérifiez votre connexion.'), { status: 0 });
  }
  const data = await res.json().catch(() => null);
  if (!data) throw Object.assign(new Error('Réponse inattendue du script Google.'), { status: 502 });
  if (!data.ok) throw Object.assign(new Error(data.error ?? 'Erreur'), { status: data.status ?? 400 });
  return data.data;
}
