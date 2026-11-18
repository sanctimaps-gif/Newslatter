import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { get, post, setCsrf } from '../services/api';
import { IS_GOOGLE } from '../services/google';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ twoFactorRequired?: boolean }>;
  verify2fa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { const r = await get('/api/auth/me'); setCsrf(r.csrfToken ?? r.token); setUser(r.user); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }, []);

  // Les pages publiques n'ont pas besoin de session : on n'interroge l'API que dans l'espace /admin.
  useEffect(() => { const path = IS_GOOGLE ? window.location.hash.slice(1) : window.location.pathname; if (path.startsWith('/admin')) refresh(); else setLoading(false); }, [refresh]);
  useEffect(() => {
    const h = () => setUser(null);
    window.addEventListener('snl:unauthorized', h);
    return () => window.removeEventListener('snl:unauthorized', h);
  }, []);

  const login = async (email: string, password: string) => {
    const r = await post('/api/auth/login', { email, password });
    setCsrf(r.csrfToken ?? r.token);
    if (r.twoFactorRequired) return { twoFactorRequired: true };
    setUser(r.user);
    return {};
  };
  const verify2fa = async (code: string) => { const r = await post('/api/auth/2fa', { code }); setCsrf(r.csrfToken ?? r.token); setUser(r.user); };
  const logout = async () => { await post('/api/auth/logout').catch(() => undefined); setCsrf(''); setUser(null); };

  return <Ctx.Provider value={{ user, loading, login, verify2fa, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth hors AuthProvider');
  return c;
}

export const canEdit = (u: User | null) => u?.role === 'admin' || u?.role === 'editor';
export const isAdmin = (u: User | null) => u?.role === 'admin';
