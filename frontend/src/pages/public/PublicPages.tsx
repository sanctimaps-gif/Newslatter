import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MailCheck, MailX, ShieldCheck } from 'lucide-react';
import PublicLayout from '../../layouts/PublicLayout';
import { get, post } from '../../services/api';
import { ErrorBox, Spinner } from '../../components/ui';

function Panel({ children }: { children: ReactNode }) {
  return <div className="card p-6 sm:p-8 fade-in">{children}</div>;
}

export function InscriptionPage() {
  const [cfg, setCfg] = useState<{ consentText: string; purpose: string } | null>(null);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(Date.now());
  useEffect(() => { get('/api/public/config').then(setCfg).catch(() => setCfg(null)); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Indiquez une adresse e-mail valide.');
    if (!consent) return setErr('Merci de cocher la case de consentement.');
    setBusy(true);
    try { const r = await post('/api/public/subscribe', { email, firstName: firstName || null, consent: true, website, startedAt: started.current }); setDone(r.message); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <PublicLayout>
      <Panel>
        {done ? (
          <div className="text-center" role="status">
            <MailCheck className="h-12 w-12 text-teal mx-auto mb-3" aria-hidden />
            <h1 className="text-2xl font-semibold mb-2">Vérifiez votre boîte mail</h1>
            <p className="text-ink-soft">{done}</p>
          </div>
        ) : (
          <>
            <p className="text-[12px] tracking-[0.14em] uppercase text-gold font-semibold text-center">La lettre de SanctiMaps</p>
            <h1 className="text-[28px] leading-tight font-semibold text-center mt-1">Un saint, un lieu, une histoire</h1>
            <p className="text-ink-soft text-center mt-2 text-[15px]">{cfg?.purpose ?? 'Recevez le saint du jour et les nouveautés de la carte mondiale des saints.'}</p>
            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              <div>
                <label className="label" htmlFor="firstName">Prénom <span className="text-ink-soft font-normal">(facultatif)</span></label>
                <input id="firstName" className="input" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={80} />
              </div>
              <div>
                <label className="label" htmlFor="email">Adresse e-mail <span className="text-accent" aria-hidden>*</span></label>
                <input id="email" type="email" required className="input" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} aria-invalid={Boolean(err && !email)} />
              </div>
              {/* Champ piège pour les robots : invisible pour les humains et les lecteurs d'écran */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                <label htmlFor="website">Ne pas remplir</label><input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
              <label className="flex items-start gap-3 text-[14px] leading-snug cursor-pointer rounded border border-line bg-paper/60 p-3">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--accent))]" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
                <span>{cfg?.consentText ?? "J'accepte de recevoir la lettre d'information de SanctiMaps."} <Link to="/confidentialite">Politique de confidentialité</Link>.</span>
              </label>
              {err && <ErrorBox message={err} />}
              <button className="btn-primary w-full min-h-[46px] text-[15px]" disabled={busy}>{busy ? 'Envoi…' : 'Je m\'inscris'}</button>
              <p className="text-[13px] text-ink-soft text-center flex items-center justify-center gap-1.5"><ShieldCheck className="h-4 w-4" aria-hidden />Vous recevrez un e-mail pour confirmer. Désinscription en un clic.</p>
            </form>
          </>
        )}
      </Panel>
    </PublicLayout>
  );
}

export function ConfirmationPage() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'error'; message?: string; firstName?: string | null }>({ status: 'loading' });
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; ran.current = true;
    if (!token) { setState({ status: 'error', message: 'Lien de confirmation incomplet.' }); return; }
    post('/api/public/confirm', { token }).then((r) => setState({ status: 'ok', firstName: r.firstName })).catch((e) => setState({ status: 'error', message: e.message }));
  }, [token]);
  return (
    <PublicLayout>
      <Panel>
        <div className="text-center" role="status">
          {state.status === 'loading' && <Spinner label="Confirmation en cours…" className="justify-center" />}
          {state.status === 'ok' && (<>
            <CheckCircle2 className="h-12 w-12 text-ok mx-auto mb-3" aria-hidden />
            <h1 className="text-2xl font-semibold mb-2">Inscription confirmée{state.firstName ? `, ${state.firstName}` : ''} !</h1>
            <p className="text-ink-soft">Merci. Vous recevrez désormais la lettre de SanctiMaps. Vous pourrez vous désinscrire à tout moment depuis chaque e-mail.</p>
            <a href="https://sanctimaps.fr/" className="btn-primary mt-6 no-underline">Explorer la carte des saints</a>
          </>)}
          {state.status === 'error' && (<>
            <MailX className="h-12 w-12 text-danger mx-auto mb-3" aria-hidden />
            <h1 className="text-2xl font-semibold mb-2">Confirmation impossible</h1>
            <p className="text-ink-soft">{state.message}</p>
            <Link to="/inscription" className="btn-secondary mt-6 no-underline">Recommencer l'inscription</Link>
          </>)}
        </div>
      </Panel>
    </PublicLayout>
  );
}

export function DesinscriptionPage() {
  const [params] = useSearchParams();
  const t = params.get('t') ?? '';
  const [info, setInfo] = useState<{ email: string | null; status: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!t) { setErr('Lien de désinscription incomplet. Utilisez le lien présent en bas de la lettre reçue.'); return; }
    get(`/api/public/unsubscribe?t=${encodeURIComponent(t)}`).then((r) => { setInfo(r); if (r.status === 'unsubscribed') setDone(true); }).catch((e) => setErr(e.message));
  }, [t]);
  const confirm = async () => {
    setBusy(true);
    try { await post('/api/public/unsubscribe', { t }); setDone(true); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <PublicLayout>
      <Panel>
        <div className="text-center">
          {err ? (<><MailX className="h-12 w-12 text-danger mx-auto mb-3" aria-hidden /><h1 className="text-2xl font-semibold mb-2">Lien non valide</h1><p className="text-ink-soft">{err}</p></>)
            : !info ? <Spinner className="justify-center" />
            : done ? (
              <div role="status">
                <CheckCircle2 className="h-12 w-12 text-ok mx-auto mb-3" aria-hidden />
                <h1 className="text-2xl font-semibold mb-2">Vous êtes désinscrit(e)</h1>
                <p className="text-ink-soft">{info.email ? <><strong>{info.email}</strong> ne recevra plus la lettre de SanctiMaps.</> : 'Vous ne recevrez plus la lettre de SanctiMaps.'} Nous ne vous réinscrirons jamais sans une nouvelle demande de votre part.</p>
                <Link to="/inscription" className="btn-secondary mt-6 no-underline">Je me suis trompé(e) : me réinscrire</Link>
              </div>
            ) : (<>
              <h1 className="text-2xl font-semibold mb-2">Se désinscrire de la lettre</h1>
              <p className="text-ink-soft mb-6">Voulez-vous vraiment ne plus recevoir la lettre de SanctiMaps{info.email ? <> à l'adresse <strong>{info.email}</strong></> : ''} ?</p>
              <button className="btn-primary min-h-[46px] px-6" onClick={confirm} disabled={busy}>{busy ? 'Désinscription…' : 'Confirmer la désinscription'}</button>
            </>)}
        </div>
      </Panel>
    </PublicLayout>
  );
}

/** Rendu Markdown minimal et sûr (aucun HTML brut interprété). */
export function SafeMarkdown({ source }: { source: string }) {
  const inline = (s: string, key: string): ReactNode[] => {
    const out: ReactNode[] = []; let rest = s; let i = 0;
    const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\))/;
    while (rest) {
      const m = rest.match(re);
      if (!m || m.index === undefined) { out.push(rest); break; }
      if (m.index) out.push(rest.slice(0, m.index));
      if (m[2]) out.push(<strong key={`${key}-${i++}`}>{m[2]}</strong>);
      else if (m[3]) out.push(<em key={`${key}-${i++}`}>{m[3]}</em>);
      else out.push(<a key={`${key}-${i++}`} href={m[5]} rel="noopener noreferrer">{m[4]}</a>);
      rest = rest.slice(m.index + m[0].length);
    }
    return out;
  };
  const blocks = source.replace(/\r/g, '').split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        const k = `b${i}`;
        if (b.startsWith('# ')) return <h1 key={k} className="text-2xl font-semibold mt-2">{inline(b.slice(2), k)}</h1>;
        if (b.startsWith('## ')) return <h2 key={k} className="text-lg font-semibold mt-5 text-accent">{inline(b.slice(3), k)}</h2>;
        if (/^- /m.test(b)) return <ul key={k} className="list-disc pl-6 space-y-1">{b.split('\n').filter((l) => l.startsWith('- ')).map((l, j) => <li key={j}>{inline(l.slice(2), `${k}-${j}`)}</li>)}</ul>;
        return <p key={k}>{b.split('\n').flatMap((l, j) => (j ? [<br key={`br${j}`} />, ...inline(l, `${k}-${j}`)] : inline(l, `${k}-${j}`)))}</p>;
      })}
    </div>
  );
}

export function ConfidentialitePage() {
  const [data, setData] = useState<{ markdown: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { get('/api/public/privacy').then(setData).catch((e) => setErr(e.message)); }, []);
  return (
    <PublicLayout wide>
      <Panel>{err ? <ErrorBox message={err} /> : !data ? <Spinner /> : <SafeMarkdown source={data.markdown || '# Politique de confidentialité\n\nEn cours de rédaction.'} />}</Panel>
    </PublicLayout>
  );
}

/** Redirection des liens suivis : enregistre le clic puis ouvre la page demandée. */
export function ClickRedirectPage() {
  const [params] = useSearchParams();
  const [err, setErr] = useState<string | null>(null);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; ran.current = true;
    post('/api/public/click', { k: params.get('k') ?? '', l: Number(params.get('l')) })
      .then((r) => { if (/^https?:\/\//.test(r.url)) window.location.replace(r.url); else setErr('Lien invalide.'); })
      .catch((e) => setErr(e.message));
  }, [params]);
  return (
    <PublicLayout>
      <div className="card p-8 text-center">{err ? <ErrorBox message={err} /> : <Spinner label="Ouverture du lien…" className="justify-center" />}</div>
    </PublicLayout>
  );
}
