import { useState } from 'react';
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { patch, post } from '../../services/api';
import { Card, ErrorBox, Field, Notice, PageHeader, useToast } from '../../components/ui';

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.displayName ?? '');
  return (
    <>
      <PageHeader title="Profil administrateur" crumbs={[{ label: 'Profil' }]} />
      <Card className="max-w-xl">
        <div className="flex items-center gap-4 mb-6"><div className="h-14 w-14 rounded-full bg-accent-soft text-accent flex items-center justify-center"><UserRound className="h-7 w-7" /></div>
          <div><p className="font-semibold text-lg">{user?.displayName}</p><p className="text-sm text-ink-soft">{user?.email} · {user?.role === 'admin' ? 'Administrateur' : user?.role === 'editor' ? 'Éditeur' : 'Lecteur'}</p></div></div>
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); try { await patch('/api/admin/profile', { displayName: name }); await refresh(); toast('Profil enregistré.'); } catch (err: any) { toast(err.message, 'danger'); } }}>
          <Field label="Nom affiché" htmlFor="p-name"><input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <button className="btn-primary">Enregistrer</button>
        </form>
      </Card>
    </>
  );
}

export function AccountPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [tfErr, setTfErr] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Paramètres du compte" crumbs={[{ label: 'Compte' }]} />
      <div className="grid xl:grid-cols-2 gap-6">
        <Card title={<h2 className="text-[17px] font-semibold flex items-center gap-2"><KeyRound className="h-5 w-5 text-accent" />Mot de passe</h2>}>
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setPwErr(null); if (pw.next !== pw.confirm) return setPwErr('Les deux nouveaux mots de passe diffèrent.'); try { await post('/api/auth/password', { current: pw.current, next: pw.next }); toast('Mot de passe modifié. Vos autres sessions ont été fermées.'); setPw({ current: '', next: '', confirm: '' }); } catch (err: any) { setPwErr(err.message); } }}>
            <Field label="Mot de passe actuel" htmlFor="pw-c"><input id="pw-c" type="password" autoComplete="current-password" className="input" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
            <Field label="Nouveau mot de passe" htmlFor="pw-n" hint="12 caractères minimum, avec des lettres et des chiffres."><input id="pw-n" type="password" autoComplete="new-password" className="input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={12} /></Field>
            <Field label="Confirmer" htmlFor="pw-2"><input id="pw-2" type="password" autoComplete="new-password" className="input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></Field>
            {pwErr && <ErrorBox message={pwErr} />}
            <button className="btn-primary">Modifier le mot de passe</button>
          </form>
        </Card>
        <Card title={<h2 className="text-[17px] font-semibold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-teal" />Authentification à deux facteurs</h2>}>
          {user?.totpEnabled ? (
            <div className="space-y-4">
              <Notice tone="ok">La double authentification est <strong>activée</strong> : un code à 6 chiffres est demandé à chaque connexion.</Notice>
              <form className="flex gap-2 items-end flex-wrap" onSubmit={async (e) => { e.preventDefault(); setTfErr(null); try { await post('/api/auth/2fa/disable', { password: disablePw }); await refresh(); toast('Double authentification désactivée.'); } catch (err: any) { setTfErr(err.message); } }}>
                <Field label="Mot de passe pour désactiver" htmlFor="tf-pw"><input id="tf-pw" type="password" className="input" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} required /></Field>
                <button className="btn-secondary text-danger">Désactiver</button>
              </form>
              {tfErr && <ErrorBox message={tfErr} />}
            </div>
          ) : !setup ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-soft">Protégez l'accès au studio avec une application d'authentification (Aegis, Google Authenticator, 1Password, Bitwarden…).</p>
              <button className="btn-primary" onClick={async () => setSetup(await post('/api/auth/2fa/setup'))}>Configurer</button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setTfErr(null); try { await post('/api/auth/2fa/enable', { code }); await refresh(); setSetup(null); toast('Double authentification activée.'); } catch (err: any) { setTfErr(err.message); } }}>
              <ol className="text-sm list-decimal pl-5 space-y-2">
                <li>Dans votre application, ajoutez un compte « clé de configuration » avec la clé :<code className="block mt-1 p-2 bg-paper border border-line rounded font-mono text-[13px] break-all select-all">{setup.secret}</code><span className="text-xs text-ink-soft">Sur téléphone, vous pouvez aussi <a href={setup.otpauth}>ouvrir ce lien</a>.</span></li>
                <li>Saisissez le code à 6 chiffres affiché :</li>
              </ol>
              <Field label="Code" htmlFor="tf-code"><input id="tf-code" className="input tracking-[0.3em] text-center max-w-[180px]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required /></Field>
              {tfErr && <ErrorBox message={tfErr} />}
              <button className="btn-primary">Activer</button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
