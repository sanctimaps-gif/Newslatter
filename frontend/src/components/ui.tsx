import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, X, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CAMPAIGN_STATUS, STATUS_LABELS } from '../services/format';
import { IS_DEMO, resetDemo } from '../services/demo';

export function Spinner({ label = 'Chargement…', className = '' }: { label?: string; className?: string }) {
  return <div role="status" className={`flex items-center gap-2 text-ink-soft text-sm ${className}`}><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{label}</div>;
}

export function PageLoader() { return <div className="py-16 flex justify-center"><Spinner /></div>; }

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded border border-danger/30 bg-danger-soft text-danger px-4 py-3 text-sm flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1">{message}</div>
      {onRetry && <button className="underline font-medium" onClick={onRetry}>Réessayer</button>}
    </div>
  );
}

export function Notice({ tone = 'info', title, children, icon }: { tone?: 'info' | 'warn' | 'ok' | 'danger'; title?: string; children: ReactNode; icon?: LucideIcon }) {
  const tones = { info: 'bg-info-soft text-info border-info/25', warn: 'bg-warn-soft text-warn border-warn/30', ok: 'bg-ok-soft text-ok border-ok/25', danger: 'bg-danger-soft text-danger border-danger/30' };
  const Icon = icon ?? (tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle);
  return (
    <div className={`rounded border px-4 py-3 text-sm flex gap-3 ${tones[tone]}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1 [&_a]:underline">{title && <p className="font-semibold mb-0.5">{title}</p>}<div className="text-ink/85">{children}</div></div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="mx-auto h-12 w-12 rounded-full bg-gold-soft text-gold flex items-center justify-center mb-4"><Icon className="h-6 w-6" aria-hidden /></div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1 text-sm text-ink-soft max-w-md mx-auto">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '', bodyClass = 'p-5' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-line/70 flex-wrap">
          {typeof title === 'string' ? <h2 className="text-[17px] font-semibold">{title}</h2> : title}
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, icon: Icon, hint, tone = 'accent' }: { label: string; value: ReactNode; icon: LucideIcon; hint?: ReactNode; tone?: 'accent' | 'teal' | 'gold' | 'danger' | 'info' }) {
  const tones = { accent: 'bg-accent-soft text-accent', teal: 'bg-teal-soft text-teal', gold: 'bg-gold-soft text-gold', danger: 'bg-danger-soft text-danger', info: 'bg-info-soft text-info' };
  return (
    <div className="card p-4 flex items-start gap-3 fade-in">
      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${tones[tone]}`}><Icon className="h-5 w-5" aria-hidden /></div>
      <div className="min-w-0">
        <p className="text-[13px] text-ink-soft leading-tight">{label}</p>
        <p className="text-2xl font-semibold font-display mt-0.5 tabular-nums">{value}</p>
        {hint && <p className="text-xs text-ink-soft mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  confirmed: 'bg-ok-soft text-ok', pending: 'bg-warn-soft text-warn', unsubscribed: 'bg-paper text-ink-soft border border-line', bounced: 'bg-danger-soft text-danger', suspended: 'bg-info-soft text-info',
  draft: 'bg-paper text-ink-soft border border-line', scheduled: 'bg-info-soft text-info', queued: 'bg-gold-soft text-gold', sending: 'bg-gold-soft text-gold', sent: 'bg-ok-soft text-ok', cancelled: 'bg-paper text-ink-soft border border-line', failed: 'bg-danger-soft text-danger',
  accepted: 'bg-ok-soft text-ok', skipped: 'bg-paper text-ink-soft border border-line', uncertain: 'bg-warn-soft text-warn', ok: 'bg-ok-soft text-ok', error: 'bg-danger-soft text-danger',
};
export function Badge({ status, label }: { status: string; label?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE_TONES[status] ?? 'bg-paper text-ink-soft border border-line'}`}>{label ?? STATUS_LABELS[status] ?? CAMPAIGN_STATUS[status] ?? status}</span>;
}

export function Field({ label, hint, error, children, htmlFor, required }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}{required && <span className="text-accent" aria-hidden> *</span>}</label>
      {children}
      {error ? <p className="text-[13px] text-danger mt-1" role="alert">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])') ?? []);
    setTimeout(() => (focusables().find((el) => el.dataset.autofocus !== undefined) ?? focusables()[1] ?? focusables()[0])?.focus(), 10);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className={`relative w-full ${w} bg-panel rounded-t-lg sm:rounded-lg shadow-pop max-h-[92vh] flex flex-col fade-in`}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 id={id} className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm !px-2" onClick={onClose} aria-label="Fermer"><X className="h-4 w-4" /></button>
        </header>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-line flex justify-end gap-2 flex-wrap">{footer}</footer>}
      </div>
    </div>
  );
}

// ─── Confirmation des actions sensibles ───
type ConfirmOpts = { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={Boolean(state)} onClose={() => close(false)} title={state?.title ?? ''} size="sm"
        footer={<><button className="btn-secondary" onClick={() => close(false)}>Annuler</button><button data-autofocus className={state?.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>{state?.confirmLabel ?? 'Confirmer'}</button></>}>
        <div className="text-sm text-ink">{state?.message}</div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ─── Notifications ───
type Toast = { id: number; tone: 'ok' | 'danger' | 'info'; text: string };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'danger' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 items-end" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === 'danger' ? 'alert' : 'status'} className={`fade-in card px-4 py-3 text-sm flex items-center gap-2 max-w-sm w-full sm:w-auto border-l-4 ${t.tone === 'ok' ? 'border-l-ok' : t.tone === 'danger' ? 'border-l-danger' : 'border-l-info'}`}>
            {t.tone === 'ok' ? <CheckCircle2 className="h-4 w-4 text-ok shrink-0" /> : t.tone === 'danger' ? <AlertTriangle className="h-4 w-4 text-danger shrink-0" /> : <Info className="h-4 w-4 text-info shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function PageHeader({ title, crumbs = [], actions, description }: { title: string; crumbs?: { label: string; to?: string }[]; actions?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-6">
      <nav aria-label="Fil d'Ariane" className="text-[13px] text-ink-soft mb-2">
        <ol className="flex items-center gap-1 flex-wrap">
          <li><Link to="/admin" className="text-ink-soft hover:text-accent no-underline">Studio</Link></li>
          {crumbs.map((c, i) => (
            <li key={i} className="flex items-center gap-1"><ChevronRight className="h-3 w-3" aria-hidden />{c.to ? <Link to={c.to} className="text-ink-soft hover:text-accent no-underline">{c.label}</Link> : <span aria-current="page" className="text-ink">{c.label}</span>}</li>
          ))}
        </ol>
      </nav>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-semibold text-ink">{title}</h1>
          {description && <p className="text-ink-soft mt-1 text-[15px] max-w-3xl">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-ink-soft flex-wrap">
      <span>{total === 0 ? 'Aucun résultat' : `${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} sur ${total}`}</span>
      <div className="flex items-center gap-1">
        <button className="btn-secondary btn-sm !px-2" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Page précédente"><ChevronLeft className="h-4 w-4" /></button>
        <span className="px-2 tabular-nums">Page {page} / {pages}</span>
        <button className="btn-secondary btn-sm !px-2" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Page suivante"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; icon?: LucideIcon }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line overflow-x-auto -mx-1 px-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`flex items-center gap-2 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${value === t.id ? 'border-accent text-accent font-medium' : 'border-transparent text-ink-soft hover:text-ink'}`}>
          {t.icon && <t.icon className="h-4 w-4" aria-hidden />}{t.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div><label htmlFor={id} className="font-medium text-sm text-ink cursor-pointer">{label}</label>{description && <p className="text-[13px] text-ink-soft mt-0.5">{description}</p>}</div>
      <button id={id} role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-teal' : 'bg-line'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

/** Bandeau du mode démonstration (GitHub Pages) : impossible de le confondre avec la vraie plateforme. */
export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div role="note" className="bg-gold-soft text-ink border-b border-gold/40 text-[13px] px-4 py-2 flex items-center justify-center gap-3 flex-wrap text-center">
      <span><strong>Démonstration</strong> — données enregistrées uniquement dans ce navigateur, aucun e-mail envoyé. La vraie plateforme tournera sur newsletter.sanctimaps.fr.</span>
      <button className="underline" onClick={() => { resetDemo(); location.reload(); }}>Réinitialiser</button>
    </div>
  );
}
