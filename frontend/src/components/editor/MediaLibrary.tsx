import { useState } from 'react';
import { ImageIcon, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { del, patch, upload } from '../../services/api';
import { EmptyState, ErrorBox, Modal, Spinner, useConfirm, useToast } from '../ui';
import type { MediaFile } from '../../types';

/** Bibliothèque d'images : téléversement sécurisé, aperçu, remplacement, suppression, texte alternatif. */
export function MediaLibrary({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect?: (m: MediaFile) => void }) {
  const { data, error, loading, reload } = useApi<MediaFile[]>(open ? '/api/admin/media' : null, [open]);
  const [busy, setBusy] = useState(false);
  const [alt, setAlt] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const send = async (file: File, replaceId?: number) => {
    setErr(null);
    if (file.size > 5 * 1024 * 1024) return setErr('Image trop lourde (5 Mo maximum).');
    setBusy(true);
    const fd = new FormData(); fd.append('alt', alt); fd.append('file', file);
    try {
      const m = await upload<MediaFile>(replaceId ? `/api/admin/media/${replaceId}/replace` : '/api/admin/media', fd);
      toast(replaceId ? 'Image remplacée.' : 'Image ajoutée et optimisée.'); setAlt(''); await reload();
      if (!replaceId && onSelect) onSelect(m);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Bibliothèque d'images" size="xl">
      <div className="grid md:grid-cols-[280px_1fr] gap-6">
        <div className="space-y-3">
          <label className="block border-2 border-dashed border-line rounded-lg p-6 text-center cursor-pointer hover:border-gold">
            <Upload className="h-7 w-7 mx-auto text-ink-soft mb-2" aria-hidden />
            <span className="font-medium text-sm">Téléverser une image</span>
            <span className="block text-xs text-ink-soft mt-1">PNG, JPEG, GIF ou WebP · 5 Mo max. Redimensionnée à 1200 px, métadonnées supprimées.</span>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && send(e.target.files[0])} disabled={busy} />
          </label>
          <div><label className="label" htmlFor="m-alt">Texte alternatif</label><input id="m-alt" className="input" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Décrivez l'image" /><p className="hint">Affiché si les images sont bloquées et lu par les lecteurs d'écran.</p></div>
          {busy && <Spinner label="Optimisation…" />}
          {err && <ErrorBox message={err} />}
        </div>
        <div>
          {error && <ErrorBox message={error} />}
          {loading && !data ? <Spinner /> : data && data.length === 0 ? <EmptyState icon={ImageIcon} title="Aucune image">Téléversez votre première image : elle sera accessible par une adresse HTTPS publique pour s'afficher dans les e-mails.</EmptyState> : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {data?.map((m) => (
                <li key={m.id} className="border border-line rounded-lg overflow-hidden bg-paper flex flex-col">
                  <button className="aspect-[4/3] bg-sea/40 flex items-center justify-center overflow-hidden" onClick={() => onSelect?.(m)} title={onSelect ? 'Utiliser cette image' : m.original_name}>
                    <img src={m.url} alt={m.alt_text} className="max-h-full max-w-full object-contain" loading="lazy" />
                  </button>
                  <div className="p-2 space-y-1.5 text-xs">
                    <input className="input !min-h-[30px] !text-xs" defaultValue={m.alt_text} placeholder="Texte alternatif" aria-label={`Texte alternatif de ${m.original_name}`} onBlur={(e) => e.target.value !== m.alt_text && patch(`/api/admin/media/${m.id}`, { alt: e.target.value }).then(() => toast('Texte alternatif enregistré.'))} />
                    <p className="text-ink-soft truncate" title={m.original_name}>{m.width}×{m.height} · {Math.round(m.size_bytes / 1024)} Ko</p>
                    <div className="flex gap-1">
                      {onSelect && <button className="btn-primary btn-sm flex-1 !px-2" onClick={() => onSelect(m)}>Utiliser</button>}
                      <label className="btn-secondary btn-sm !px-2 cursor-pointer" title="Remplacer"><RefreshCw className="h-3.5 w-3.5" /><span className="sr-only">Remplacer</span><input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && send(e.target.files[0], m.id)} /></label>
                      <button className="btn-secondary btn-sm !px-2 text-danger" title="Supprimer" onClick={async () => { if (await confirm({ title: 'Supprimer cette image ?', message: 'Elle disparaîtra aussi des e-mails déjà envoyés qui l\'utilisent.', danger: true, confirmLabel: 'Supprimer' })) { await del(`/api/admin/media/${m.id}`); toast('Image supprimée.'); reload(); } }}><Trash2 className="h-3.5 w-3.5" /><span className="sr-only">Supprimer</span></button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
