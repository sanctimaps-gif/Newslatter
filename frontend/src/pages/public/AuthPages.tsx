import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, Lock } from 'lucide-react';
import PublicLayout from '../../layouts/PublicLayout';
import { useAuth } from '../../hooks/useAuth';
import { get, post, setCsrf } from '../../services/api';
import { IS_GOOGLE, loadConfig } from '../../services/google';
import { ErrorBox, Notice } from '../../components/ui';

export function LoginPage() {
  const { user, loading, login, verify2fa, refresh } = useAuth();
  const [setup, setSetup] = useState<'unknown' | 'needed' | 'done' | 'unlinked'>('unknown');
  const [name, setName] = useState('');
  const [setupCodeValue, setSetupCodeValue] = useState('');
  useEffect(() => {
    (async () => {
      if (IS_GOOGLE && !(await loadConfig()).scriptUrl) return setSetup('unlinked');
      try { const c = await get('/api/public/config'); setSetup(c.needsSetup ? 'needed' : 'done'); } catch { setSetup('done'); }
    })();
  }, []);
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'password' | '2fa'>('password');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('suite')?.startsWith('/admin') ? params.get('suite')! : '/admin';
  if (loading) return null;
  if (user) return <Navigate to={next} replace />;
  if (setup === 'unlinked') return <NotLinked />;
  if (setup === 'needed') return (
    <PublicLayout>
      <div className="card p-6 sm:p-8 fade-in">
        <h1 className="text-2xl font-semibold text-center">Créer le compte administrateur</h1>
        <p className="text-ink-soft text-sm mt-1 mb-5 text-center">Première connexion. Le code d'installation est affiché dans le journal d'exécution de la fonction « installer » du script Google.</p>
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setErr(null); setBusy(true); try { const r = await post('/api/auth/setup', { code: setupCodeValue, email, name, password }); setCsrf(r.token); await refresh(); nav('/admin'); } catch (er: any) { setErr(er.message); } finally { setBusy(false); } }}>
          <div><label className="label" htmlFor="s-code">Code d'installation</label><input id="s-code" className="input uppercase tracking-widest" value={setupCodeValue} onChange={(e) => setSetupCodeValue(e.target.value)} required /></div>
          <div><label className="label" htmlFor="s-name">Votre nom</label><input id="s-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label" htmlFor="s-email">Adresse e-mail (identifiant)</label><input id="s-email" type="email" className="input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><label className="label" htmlFor="s-pw">Mot de passe</label><input id="s-pw" type="password" className="input" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required /><p className="hint">12 caractères minimum, avec des lettres et des chiffres.</p></div>
          {err && <ErrorBox message={err} />}
          <button className="btn-primary w-full min-h-[46px]" disabled={busy}>{busy ? 'Création…' : 'Créer mon compte'}</button>
        </form>
      </div>
    </PublicLayout>
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      if (step === 'password') { const r = await login(email, password); if (r.twoFactorRequired) setStep('2fa'); else nav(next); }
      else { await verify2fa(code); nav(next); }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <PublicLayout>
      <div className="card p-6 sm:p-8 fade-in">
        <div className="text-center mb-6">
          <div className="mx-auto h-11 w-11 rounded-full bg-accent-soft text-accent flex items-center justify-center mb-3">{step === 'password' ? <Lock className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}</div>
          <h1 className="text-2xl font-semibold">Newsletter Studio</h1>
          <p className="text-ink-soft text-sm mt-1">{step === 'password' ? 'Espace réservé à l\'administration de SanctiMaps' : 'Saisissez le code à 6 chiffres de votre application d\'authentification'}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {step === 'password' ? (<>
            <div><label className="label" htmlFor="email">Adresse e-mail</label><input id="email" type="email" className="input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div><label className="label" htmlFor="pw">Mot de passe</label><input id="pw" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          </>) : (
            <div><label className="label" htmlFor="code">Code de vérification</label><input id="code" className="input text-center tracking-[0.4em] text-lg" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required /></div>
          )}
          {err && <ErrorBox message={err} />}
          <button className="btn-primary w-full min-h-[46px]" disabled={busy}>{busy ? 'Vérification…' : step === 'password' ? 'Se connecter' : 'Valider'}</button>
          {step === 'password' && <p className="text-center text-sm"><Link to="/admin/mot-de-passe-oublie">Mot de passe oublié ?</Link></p>}
        </form>
      </div>
    </PublicLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    try { const r = await post('/api/auth/password-reset/request', { email }); setMsg(r.message); } catch (e: any) { setErr(e.message); }
  };
  return (
    <PublicLayout>
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold mb-1">Mot de passe oublié</h1>
        <p className="text-ink-soft text-sm mb-5">Un lien de réinitialisation valable une heure vous sera envoyé.</p>
        {msg ? <Notice tone="ok">{msg}</Notice> : (
          <form onSubmit={submit} className="space-y-4">
            <div><label className="label" htmlFor="email">Adresse e-mail du compte</label><input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            {err && <ErrorBox message={err} />}
            <button className="btn-primary w-full">Envoyer le lien</button>
          </form>
        )}
        <p className="text-center text-sm mt-4"><Link to="/admin/connexion">Retour à la connexion</Link></p>
      </div>
    </PublicLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (pw !== pw2) return setErr('Les deux mots de passe ne correspondent pas.');
    try { await post('/api/auth/password-reset/confirm', { token: params.get('t') ?? '', password: pw }); setOk(true); } catch (e: any) { setErr(e.message); }
  };
  return (
    <PublicLayout>
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold mb-4">Nouveau mot de passe</h1>
        {ok ? <Notice tone="ok">Mot de passe modifié. <Link to="/admin/connexion">Se connecter</Link></Notice> : (
          <form onSubmit={submit} className="space-y-4">
            <div><label className="label" htmlFor="pw">Nouveau mot de passe</label><input id="pw" type="password" className="input" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={12} required /><p className="hint">12 caractères minimum, avec des lettres et des chiffres.</p></div>
            <div><label className="label" htmlFor="pw2">Confirmer</label><input id="pw2" type="password" className="input" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></div>
            {err && <ErrorBox message={err} />}
            <button className="btn-primary w-full">Enregistrer</button>
          </form>
        )}
      </div>
    </PublicLayout>
  );
}

/** Affiché tant que le site n'est pas relié au script Google (adresse absente de config.json). */
export function NotLinked() {
  return (
    <PublicLayout>
      <div className="card p-6 sm:p-8 fade-in">
        <h1 className="text-2xl font-semibold mb-2">Installation à terminer</h1>
        <p className="text-ink-soft text-sm mb-4">Le site est en ligne, mais il n'est pas encore relié au script Google qui enregistre les abonnés et envoie les e-mails.</p>
        <ol className="text-sm list-decimal pl-5 space-y-1.5">
          <li>Créer le tableur et coller le script (documentation/google.md, étapes 1 à 3).</li>
          <li>Déployer le script en « Application Web » et copier son adresse.</li>
          <li>Coller cette adresse dans le fichier <code>config.json</code> du dépôt GitHub.</li>
        </ol>
      </div>
    </PublicLayout>
  );
}
