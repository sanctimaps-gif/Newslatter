// Point d'entrée unique pour les appels à l'API : cookies de session, jeton CSRF, erreurs lisibles.
import { IS_GOOGLE, googleCall, setToken } from './google';
let csrfToken = '';
export const setCsrf = (t: string) => { csrfToken = t; if (IS_GOOGLE) setToken(t); };

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) { super(message); }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T = any>(path: string, opts: { method?: Method; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body || opts.form ? 'POST' : 'GET');
  if (IS_GOOGLE) {
    try { return (await googleCall(method, path, opts.body, opts.form)) as T; }
    catch (e: any) {
      if (e.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new CustomEvent('snl:unauthorized'));
      throw new ApiError(e.status ?? 400, e.message);
    }
  }
  const headers: Record<string, string> = {};
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, { method, headers, credentials: 'same-origin', body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined), signal: opts.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(0, 'Le serveur est injoignable. Vérifiez votre connexion.');
  }
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('application/json') ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/me' && !path.startsWith('/api/auth/login') && !location.pathname.startsWith('/admin/connexion')) {
      window.dispatchEvent(new CustomEvent('snl:unauthorized'));
    }
    const msg = (data && typeof data === 'object' && (data.error || data.message)) || (res.status === 429 ? 'Trop de tentatives, patientez quelques minutes.' : `Erreur ${res.status}`);
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export const get = <T = any>(p: string, signal?: AbortSignal) => api<T>(p, { signal });
export const post = <T = any>(p: string, body: unknown = {}) => api<T>(p, { method: 'POST', body });
export const put = <T = any>(p: string, body: unknown) => api<T>(p, { method: 'PUT', body });
export const patch = <T = any>(p: string, body: unknown) => api<T>(p, { method: 'PATCH', body });
export const del = <T = any>(p: string) => api<T>(p, { method: 'DELETE' });
export const upload = <T = any>(p: string, form: FormData) => api<T>(p, { method: 'POST', form });

export async function download(path: string, filename: string) {
  let blob: Blob;
  if (IS_GOOGLE) {
    const data = await api(path);
    blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: 'text/plain;charset=utf-8' });
  } else {
    const res = await fetch(path, { credentials: 'same-origin' });
    if (!res.ok) throw new ApiError(res.status, 'Téléchargement impossible.');
    blob = await res.blob();
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
