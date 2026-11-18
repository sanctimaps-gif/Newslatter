import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, Lock } from 'lucide-react';
import PublicLayout from '../../layouts/PublicLayout';
import { useAuth } from '../../hooks/useAuth';
import { post } from '../../services/api';
import { ErrorBox, Notice } from '../../components/ui';

export function LoginPage() {
  const { user, loading, login, verify2fa } = useAuth();
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
