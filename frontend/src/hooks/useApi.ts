import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from '../services/api';

/** Chargement d'une ressource avec états de chargement / erreur et rechargement. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    setLoading(true); setError(null);
    try { setData(await get<T>(path, c.signal)); }
    catch (e: any) { if (e?.name !== 'AbortError') setError(e.message); }
    finally { if (!c.signal.aborted) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => { load(); return () => ctrl.current?.abort(); }, [load]);
  return { data, error, loading, reload: load, setData };
}
