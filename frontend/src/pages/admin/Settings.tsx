import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Code2, Globe, History, KeyRound, Mail, Server, Shield, UserCog, XCircle } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { isAdmin, useAuth } from '../../hooks/useAuth';
import { del, post, put } from '../../services/api';
import { fmtDate, fmtRelative } from '../../services/format';
import { Badge, Card, ErrorBox, Field, Notice, PageHeader, PageLoader, Tabs, Toggle, useConfirm, useToast } from '../../components/ui';
import { SafeMarkdown } from '../public/PublicPages';

type Tab = 'expediteur' | 'envoi' | 'domaine' | 'suivi' | 'confidentialite' | 'integration' | 'journaux' | 'comptes';

export default function SettingsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('onglet') as Tab) || 'expediteur';
  const { data, error, loading, reload } = useApi<any>('/api/admin/settings');
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'expediteur', label: 'Expéditeur', icon: Mail }, { id: 'envoi', label: 'Envoi & SMTP', icon: Server }, { id: 'domaine', label: 'Domaine (DNS)', icon: Globe },
    { id: 'suivi', label: 'Suivi', icon: History }, { id: 'confidentialite', label: 'RGPD', icon: Shield }, { id: 'integration', label: 'Intégration site', icon: Code2 },
    { id: 'journaux', label: 'Journaux', icon: History }, ...(isAdmin(user) ? [{ id: 'comptes' as Tab, label: 'Comptes', icon: UserCog }] : []),
  ];
  return (
    <>
      <PageHeader title="Paramètres" crumbs={[{ label: 'Paramètres' }]} />
      <Tabs label="Sections des paramètres" tabs={tabs} value={tab} onChange={(t) => setParams({ onglet: t })} />
      <div className="mt-6">
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data ? <PageLoader /> : data && (<>
          {!isAdmin(user) && <div className="mb-4"><Notice tone="info">Seul un administrateur peut modifier ces paramètres.</Notice></div>}
          {tab === 'expediteur' && <SenderTab data={data} reload={reload} />}
          {tab === 'envoi' && <SendingTab data={data} reload={reload} />}
          {tab === 'domaine' && <DomainTab data={data} reload={reload} />}
          {tab === 'suivi' && <TrackingTab data={data} reload={reload} />}
          {tab === 'confidentialite' && <PrivacyTab data={data} reload={reload} />}
          {tab === 'integration' && <IntegrationTab data={data} />}
          {tab === 'journaux' && <LogsTab />}
          {tab === 'comptes' && <UsersTab />}
        </>)}
      </div>
    </>
  );
}

function useSaver(reload: () => void) {
  const toast = useToast();
  return async (section: string, body: unknown) => { try { await put(`/api/admin/settings/${section}`, body); toast('Paramètres enregistrés.'); reload(); } catch (e: any) { toast(e.message, 'danger'); } };
}

function SenderTab({ data, reload }: { data: any; reload: () => void }) {
  const save = useSaver(reload);
  const [s, setS] = useState(data.settings.sender);
  const [o, setO] = useState(data.settings.organization);
  return (
    <div className="grid xl:grid-cols-2 gap-6">
      <Card title="Adresse d'expédition">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save('sender', s); }}>
          <Field label="Nom de l'expéditeur" htmlFor="f-name"><input id="f-name" className="input" value={s.fromName} onChange={(e) => setS({ ...s, fromName: e.target.value })} /></Field>
          <Field label="Adresse d'expédition" htmlFor="f-email" hint={data.smtp?.mode === 'google' ? `L'adresse Gmail du site (${data.smtp.account}) ou une adresse @sanctimaps.fr ajoutée dans Gmail. Changer d'adresse impose une nouvelle vérification.` : "Doit appartenir à sanctimaps.fr (ex. newsletter@sanctimaps.fr). Changer d'adresse impose une nouvelle vérification avant tout envoi réel."}><input id="f-email" type="email" className="input" value={s.fromEmail} onChange={(e) => setS({ ...s, fromEmail: e.target.value })} /></Field>
          <Field label="Adresse de réponse" htmlFor="f-reply" hint="Facultative. Les réponses des lecteurs y arrivent."><input id="f-reply" type="email" className="input" value={s.replyTo} onChange={(e) => setS({ ...s, replyTo: e.target.value })} /></Field>
          <button className="btn-primary">Enregistrer</button>
        </form>
      </Card>
      <Card title="Éditeur de la lettre (mentions légales)">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save('organization', o); }}>
          <Field label="Nom" htmlFor="o-name"><input id="o-name" className="input" value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} /></Field>
          <Field label="Texte légal du pied de page" htmlFor="o-legal" hint="Affiché dans chaque e-mail, au-dessus du lien de désinscription."><textarea id="o-legal" className="input" rows={2} value={o.legalText} onChange={(e) => setO({ ...o, legalText: e.target.value })} /></Field>
          <Field label="E-mail de contact (RGPD)" htmlFor="o-contact"><input id="o-contact" type="email" className="input" value={o.contactEmail} onChange={(e) => setO({ ...o, contactEmail: e.target.value })} /></Field>
          <Field label="Site" htmlFor="o-web"><input id="o-web" className="input" value={o.website} onChange={(e) => setO({ ...o, website: e.target.value })} /></Field>
          <button className="btn-primary">Enregistrer</button>
        </form>
      </Card>
    </div>
  );
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: ReactNode }) {
  return <li className="flex items-start gap-2">{ok ? <CheckCircle2 className="h-5 w-5 text-ok shrink-0" aria-label="valide" /> : <XCircle className="h-5 w-5 text-danger shrink-0" aria-label="non valide" />}<div><span className="font-medium">{label}</span>{detail && <p className="text-xs text-ink-soft break-all">{detail}</p>}</div></li>;
}

function SendingTab({ data, reload }: { data: any; reload: () => void }) {
  const admin = isAdmin(useAuth().user);
  const save = useSaver(reload); const toast = useToast(); const confirm = useConfirm();
  const [lim, setLim] = useState(data.settings.sending);
  const [busy, setBusy] = useState(false);
  const st = data.settings; const smtp = data.smtp;
  const { data: jobs } = useApi<any>('/api/admin/jobs');
  const hb = jobs?.workerHeartbeat?.at ? new Date(jobs.workerHeartbeat.at) : null;
  const workerAlive = hb && Date.now() - +hb < 60_000;
  return (
    <div className="grid xl:grid-cols-2 gap-6">
      {smtp.mode === 'google' ? (
      <Card title="Envoi par Gmail">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[['Compte Google du script', smtp.account || '—'], ['Adresse d\'expédition', st.sender.fromEmail], ['Adresse autorisée dans Gmail', smtp.fromAllowed ? 'oui' : 'non — à configurer'], ['Désinscription en un clic', smtp.gmailApi ? 'active (API Gmail)' : 'service « Gmail API » à activer'], ['Envoyés aujourd\'hui', `${smtp.sentToday} / ${smtp.maxPerDay}`], ['Quota Google restant', smtp.remainingQuota ?? '—']].map(([k, v]) => <div key={String(k)}><dt className="text-ink-soft text-[13px]">{k}</dt><dd className="font-medium break-all">{String(v)}</dd></div>)}
        </dl>
        {!smtp.fromAllowed && <div className="mt-4"><Notice tone="warn" title="Adresse non autorisée dans Gmail">Utilisez {smtp.account} comme expéditeur (Paramètres → Expéditeur), ou ajoutez {st.sender.fromEmail} dans Gmail → Paramètres → Comptes → « Envoyer des e-mails en tant que ».</Notice></div>}
        <p className="hint mt-3">Un compte Gmail gratuit peut envoyer environ 100 e-mails par jour par ce moyen : au-delà, l'envoi reprend automatiquement le lendemain.</p>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button className="btn-secondary" disabled={busy || !admin} onClick={async () => { setBusy(true); try { const r = await post('/api/admin/settings/smtp/verify'); toast(r.message, r.ok ? 'ok' : 'danger'); reload(); } finally { setBusy(false); } }}>Vérifier l'adresse d'expédition</button>
          <span className="text-sm text-ink-soft">{st.smtpCheck.checkedAt ? <>{st.smtpCheck.ok ? '✅' : '❌'} {st.smtpCheck.message} ({fmtRelative(st.smtpCheck.checkedAt)})</> : 'Jamais vérifiée'}</span>
        </div>
        <div className="mt-4 text-sm flex items-center gap-2">Envois automatiques (toutes les 5 min) : {hb && Date.now() - +hb < 15 * 60_000 ? <Badge status="ok" label="actifs" /> : <Badge status="error" label="aucun signal" />}<span className="text-ink-soft">{hb ? `dernier passage ${fmtRelative(hb.toISOString())}` : ''}</span></div>
      </Card>
      ) : (
      <Card title="Serveur SMTP">
        {data.sandbox && <div className="mb-4"><Notice tone="warn" title="Mode bac à sable actif (MAIL_SANDBOX=true)">Tous les e-mails sont capturés par une boîte de test locale. <strong>Aucun message ne part vers Internet.</strong> Pour envoyer réellement, renseignez les variables SMTP sur le serveur (voir documentation/email-configuration.md).</Notice></div>}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[['Mode', smtp.mode === 'sandbox' ? 'Bac à sable' : 'Réel'], ['Serveur', smtp.host || 'non configuré'], ['Port', smtp.port], ['Sécurité', smtp.security === 'starttls' ? 'STARTTLS' : smtp.security === 'tls' ? 'TLS implicite' : 'aucune (local)'], ['Identifiant', smtp.user || '—'], ['Mot de passe', smtp.passwordSet ? '•••••••• (défini)' : 'non défini']].map(([k, v]) => <div key={k}><dt className="text-ink-soft text-[13px]">{k}</dt><dd className="font-medium">{v}</dd></div>)}
        </dl>
        <p className="hint mt-3">Les secrets SMTP sont lus dans les variables d'environnement du serveur et ne sont jamais affichés en entier ni stockés en base.</p>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button className="btn-secondary" disabled={busy || !admin} onClick={async () => { setBusy(true); try { const r = await post('/api/admin/settings/smtp/verify'); toast(r.message, r.ok ? 'ok' : 'danger'); reload(); } finally { setBusy(false); } }}>Tester la connexion SMTP</button>
          <span className="text-sm text-ink-soft">{st.smtpCheck.checkedAt ? <>{st.smtpCheck.ok ? '✅' : '❌'} {st.smtpCheck.message} ({fmtRelative(st.smtpCheck.checkedAt)})</> : 'Jamais testée'}</span>
        </div>
        <div className="mt-4 text-sm flex items-center gap-2">Worker d'envoi : {workerAlive ? <Badge status="ok" label="actif" /> : <Badge status="error" label="inactif" />}<span className="text-ink-soft">{hb ? `dernier signal ${fmtRelative(hb.toISOString())}` : 'aucun signal'}</span></div>
      </Card>
      )}
      <Card title="Limites d'envoi">
        <form className="grid sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save('sending', lim); }}>
          <Field label="Taille d'un lot" htmlFor="l-b" hint="Messages envoyés par lot."><input id="l-b" type="number" min={1} max={500} className="input" value={lim.batchSize} onChange={(e) => setLim({ ...lim, batchSize: +e.target.value })} /></Field>
          <Field label="Pause entre deux lots (ms)" htmlFor="l-d"><input id="l-d" type="number" min={0} className="input" value={lim.batchDelayMs} onChange={(e) => setLim({ ...lim, batchDelayMs: +e.target.value })} /></Field>
          <Field label="Maximum par heure" htmlFor="l-h" hint="Respectez la limite de votre relais SMTP."><input id="l-h" type="number" min={1} className="input" value={lim.maxPerHour} onChange={(e) => setLim({ ...lim, maxPerHour: +e.target.value })} /></Field>
          {lim.maxPerDay !== undefined && <Field label="Maximum par jour" htmlFor="l-j" hint="Gmail gratuit : 100 au plus."><input id="l-j" type="number" min={1} max={2000} className="input" value={lim.maxPerDay} onChange={(e) => setLim({ ...lim, maxPerDay: +e.target.value })} /></Field>}
          <Field label="Tentatives max. (refus temporaire)" htmlFor="l-a"><input id="l-a" type="number" min={1} max={10} className="input" value={lim.maxAttempts} onChange={(e) => setLim({ ...lim, maxAttempts: +e.target.value })} /></Field>
          <div className="sm:col-span-2"><button className="btn-primary">Enregistrer</button></div>
        </form>
      </Card>
      <Card title="Envois" className="xl:col-span-2">
        <p className="text-sm text-ink-soft mb-4">{smtp.mode === 'google' ? 'Les envois fonctionnent dès que Gmail peut utiliser l\'adresse d\'expédition (vérifié automatiquement à chaque envoi). Les autres points sont des recommandations.' : 'Les campagnes réelles restent bloquées tant que toutes les vérifications ne sont pas réussies.'}</p>
        <ul className="grid md:grid-cols-2 gap-3 text-sm mb-4">
          {smtp.mode !== 'google' && <Check ok={!data.sandbox} label="Relais SMTP réel configuré" detail={data.sandbox ? 'Bac à sable actif' : smtp.host} />}
          <Check ok={st.smtpCheck.ok} label={smtp.mode === 'google' ? 'Adresse d\'expédition autorisée dans Gmail' : 'Connexion SMTP vérifiée'} detail={st.smtpCheck.message} />
          {smtp.dnsRequired === false ? <Check ok label="SPF, DKIM, DMARC" detail="Gérés par Google pour une adresse Gmail : rien à régler." /> : <>
          <Check ok={st.domainCheck.spf} label="SPF" detail={st.domainCheck.details?.spf} />
          <Check ok={st.domainCheck.dkim} label="DKIM" detail={st.domainCheck.details?.dkim} />
          <Check ok={st.domainCheck.dmarc} label="DMARC" detail={st.domainCheck.details?.dmarc} /></>}
          <Check ok={Boolean(st.testEmail.sentAt)} label="E-mail de test accepté" detail={st.testEmail.sentAt ? `${st.testEmail.to} — ${fmtDate(st.testEmail.sentAt)}` : undefined} />
          <Check ok={st.privacyPolicy.reviewed} label="Politique de confidentialité relue" />
        </ul>
        <Toggle checked={st.realSendingEnabled} disabled={!admin} label="Envois actifs" description="Désactivez pour mettre immédiatement tous les envois en pause (campagnes en cours et programmées)."
          onChange={async (v) => { if (!v && !(await confirm({ title: 'Mettre les envois en pause ?', message: 'Aucune lettre ne partira tant que vous ne les réactivez pas.', confirmLabel: 'Mettre en pause' }))) return; try { await post('/api/admin/settings/real-sending', { enabled: v }); toast(v ? 'Envois actifs.' : 'Envois en pause.'); reload(); } catch (e: any) { toast(e.message, 'danger'); } }} />
      </Card>
    </div>
  );
}

function DomainTab({ data, reload }: { data: any; reload: () => void }) {
  const save = useSaver(reload); const toast = useToast();
  const { data: guide } = useApi<any>('/api/admin/settings/dns-guide', [data.settings.dkimSelector]);
  const [sel, setSel] = useState(data.settings.dkimSelector);
  const [busy, setBusy] = useState(false);
  const dc = data.settings.domainCheck;
  return (
    <div className="space-y-6">
      {data.smtp?.dnsRequired === false && <Notice tone="ok" title="Rien à régler pour l'instant">Vos lettres partent de l'adresse Gmail {data.smtp.account} : Google gère déjà SPF, DKIM et DMARC. Cette page ne servira que si vous envoyez un jour depuis une adresse @sanctimaps.fr, ou pour l'adresse newsletter.sanctimaps.fr du site.</Notice>}
      <Notice tone="warn" title="Ne modifiez jamais les enregistrements existants de sanctimaps.fr">Il s'agit uniquement d'<strong>ajouts</strong>. Les enregistrements de GitHub Pages (@ et www) ne doivent pas être touchés. Pour SPF, on complète l'enregistrement existant au lieu d'en créer un second. Aucune modification DNS n'est faite automatiquement.</Notice>
      <Card title="Registraire : IONOS">
        <ol className="text-sm list-decimal pl-5 space-y-1.5">
          <li>Espace client IONOS → <strong>Domaines &amp; SSL</strong> → <code>sanctimaps.fr</code> → engrenage → <strong>DNS</strong>.</li>
          <li>Faites une capture de la zone actuelle avant tout changement.</li>
          <li>Utilisez <strong>Ajouter un enregistrement</strong> pour chaque ligne ci-dessous. Si un enregistrement <code>v=spf1</code> existe déjà, complétez-le au lieu d'en créer un second.</li>
          <li>Ne modifiez pas les enregistrements de <code>@</code> et <code>www</code> qui pointent vers GitHub Pages.</li>
        </ol>
        <p className="hint mt-3">Guide complet (boîte IONOS ou relais dédié, réglages SMTP, limites) : documentation/ionos.md</p>
      </Card>
      <Card title="Enregistrements à ajouter chez votre registraire" bodyClass="p-0">
        <div className="overflow-x-auto"><table className="table"><thead><tr><th>Type</th><th>Nom</th><th>Valeur</th><th>Rôle</th></tr></thead>
          <tbody>{guide?.records.map((r: any) => <tr key={r.name}><td className="font-mono text-xs">{r.type}</td><td className="font-mono text-xs">{r.name}</td><td className="font-mono text-xs break-all max-w-md">{r.value}</td><td className="text-[13px] text-ink-soft">{r.purpose}</td></tr>)}</tbody></table></div>
      </Card>
      <Card title="Vérification du domaine d'expédition">
        <div className="flex gap-3 items-end flex-wrap mb-4">
          <Field label="Sélecteur DKIM (fourni par le relais)" htmlFor="dk"><input id="dk" className="input" value={sel} onChange={(e) => setSel(e.target.value)} placeholder="ex. s1, mail, scw" /></Field>
          <button className="btn-secondary" onClick={() => save('dkimSelector', sel)}>Enregistrer</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { await post('/api/admin/settings/domain/check'); toast('Vérification DNS effectuée.'); reload(); } catch (e: any) { toast(e.message, 'danger'); } finally { setBusy(false); } }}>{busy ? 'Interrogation DNS…' : 'Vérifier maintenant'}</button>
        </div>
        {dc.checkedAt ? <ul className="space-y-2 text-sm"><Check ok={dc.spf} label="SPF" detail={dc.details?.spf} /><Check ok={dc.dkim} label="DKIM" detail={dc.details?.dkim} /><Check ok={dc.dmarc} label="DMARC" detail={dc.details?.dmarc} /><li className="text-xs text-ink-soft">Dernière vérification : {fmtDate(dc.checkedAt)}</li></ul> : <p className="text-sm text-ink-soft">Jamais vérifié.</p>}
      </Card>
    </div>
  );
}

function TrackingTab({ data, reload }: { data: any; reload: () => void }) {
  const admin = isAdmin(useAuth().user);
  const save = useSaver(reload);
  const t = data.settings.tracking;
  return (
    <Card title="Mesure d'audience" className="max-w-3xl"><div className="space-y-5">
      <Toggle checked={t.clicks} disabled={!admin} onChange={(v) => save('tracking', { ...t, clicks: v })} label="Suivi des clics" description="Désactivé par défaut. Activé, les liens passent par une redirection qui enregistre le clic : pratique pour les statistiques, mais cela augmente le risque d'arriver dans les indésirables." />
      <Toggle checked={t.opens} disabled={!admin} onChange={(v) => save('tracking', { ...t, opens: v })} label="Mesure des ouvertures (estimation)" description="Désactivée par défaut. Ajoute une image invisible de 1 pixel ; à activer aussi campagne par campagne. Mesure peu fiable et plus intrusive : mentionnez-la dans la politique de confidentialité si vous l'activez." />
    </div></Card>
  );
}

function PrivacyTab({ data, reload }: { data: any; reload: () => void }) {
  const save = useSaver(reload);
  const [p, setP] = useState(data.settings.privacyPolicy);
  const [r, setR] = useState(data.settings.retention);
  const [preview, setPreview] = useState(false);
  return (
    <div className="grid xl:grid-cols-[1fr_360px] gap-6">
      <Card title="Politique de confidentialité" actions={<><button className="btn-ghost btn-sm" onClick={() => setPreview(!preview)}>{preview ? 'Modifier' : 'Aperçu'}</button><Link className="btn-ghost btn-sm no-underline" to="/confidentialite" target="_blank" rel="noreferrer">Page publique</Link></>}>
        {!p.reviewed && <div className="mb-4"><Notice tone="warn">Brouillon : complétez les passages entre crochets et faites-la vérifier avant la mise en production.</Notice></div>}
        {preview ? <SafeMarkdown source={p.markdown} /> : <textarea className="input font-mono text-[13px]" rows={22} value={p.markdown} onChange={(e) => setP({ ...p, markdown: e.target.value })} aria-label="Texte de la politique (Markdown)" />}
        <label className="flex items-center gap-2 text-sm mt-4"><input type="checkbox" checked={p.reviewed} onChange={(e) => setP({ ...p, reviewed: e.target.checked })} />J'ai relu et validé cette politique pour la mise en production</label>
        <button className="btn-primary mt-4" onClick={() => save('privacyPolicy', p)}>Enregistrer</button>
      </Card>
      <div className="space-y-6">
        <Card title="Durées de conservation"><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save('retention', r); }}>
          <Field label="Inscriptions non confirmées (jours)" htmlFor="r-u"><input id="r-u" type="number" className="input" value={r.unconfirmedDays} onChange={(e) => setR({ ...r, unconfirmedDays: +e.target.value })} /></Field>
          <Field label="Journaux d'envoi (mois)" htmlFor="r-l"><input id="r-l" type="number" className="input" value={r.logsMonths} onChange={(e) => setR({ ...r, logsMonths: +e.target.value })} /></Field>
          <button className="btn-primary">Enregistrer</button>
        </form></Card>
        {data.settings.subscription && <Card title="Inscription">
          <Toggle checked={Boolean(data.settings.subscription.doubleOptIn)} onChange={(v) => save('subscription', { doubleOptIn: v })} label="Confirmation par e-mail (double opt-in)"
            description="Désactivée : la personne est abonnée dès qu'elle valide le formulaire avec la case de consentement cochée. Activée : elle doit d'abord cliquer sur un lien reçu par e-mail (protège contre les adresses erronées ou saisies par un tiers)." />
        </Card>}
        <Card title="Mesures RGPD en place"><ul className="text-sm space-y-1.5 list-disc pl-5">
          <li>Consentement explicite (case à cocher) avec preuve horodatée{data.settings.subscription?.doubleOptIn ? ' + double opt-in' : ''}</li><li>Preuve horodatée (texte accepté, source, IP tronquée)</li><li>Désinscription en un clic, sans connexion</li><li>Liste d'exclusion par empreinte chiffrée</li><li>Export des données d'un abonné (fiche abonné)</li><li>Effacement par anonymisation (fiche abonné)</li><li>Purge automatique des inscriptions non confirmées</li><li>Journal d'audit des opérations</li>
        </ul></Card>
      </div>
    </div>
  );
}

function IntegrationTab({ data }: { data: any }) {
  const base = data.publicUrl.replace(/\/$/, '');
  const snippetA = `<!-- Formulaire SanctiMaps Newsletter (option A) -->
<form id="snl-form" style="max-width:420px">
  <label for="snl-email">Votre adresse e-mail</label>
  <input id="snl-email" type="email" required autocomplete="email">
  <label for="snl-first">Prénom (facultatif)</label>
  <input id="snl-first" autocomplete="given-name">
  <label><input id="snl-consent" type="checkbox" required>
    J'accepte de recevoir la lettre de SanctiMaps. <a href="${base}/confidentialite">Confidentialité</a></label>
  <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <button type="submit">Je m'inscris</button>
  <p id="snl-msg" role="status"></p>
</form>
<script>
(function () {
  var f = document.getElementById('snl-form'), t0 = Date.now();
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    fetch('${data.scriptUrl || base + '/api/public/subscribe'}', {
      method: 'POST', ${data.scriptUrl ? '' : "headers: { 'Content-Type': 'application/json' },"}
      body: JSON.stringify(${data.scriptUrl ? "{ path: '/api/public/subscribe', method: 'POST', body: " : ''}{
        email: f.querySelector('#snl-email').value,
        firstName: f.querySelector('#snl-first').value || null,
        consent: f.querySelector('#snl-consent').checked,
        website: f.website.value, startedAt: t0,
        ${data.siteKey ? `siteKey: '${data.siteKey}', ` : ''}source: 'site-principal'
      }${data.scriptUrl ? ' }' : ''})
    }).then(function (r) { return r.json(); }).then(function (r) {
      ${data.scriptUrl ? 'r = r.ok ? r.data : r;' : ''}
      document.getElementById('snl-msg').textContent = r.message || r.error;
    }).catch(function () { document.getElementById('snl-msg').textContent = 'Erreur réseau, réessayez.'; });
  });
})();
</script>`;
  const snippetB = `<a href="${base}/inscription" class="bouton-newsletter">Recevoir la lettre de SanctiMaps</a>`;
  const toast = useToast();
  const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast('Copié dans le presse-papiers.'));
  return (
    <div className="space-y-6">
      <Notice tone="info" title="Aucune modification automatique du site principal">Ces extraits sont à coller vous-même dans le dépôt du site sanctimaps.fr quand vous le déciderez. La clé publique ci-dessous n'autorise que l'inscription (jamais l'administration) et l'API n'accepte que les origines {data.publicUrl.includes('localhost') ? 'configurées dans CORS_ORIGINS' : 'sanctimaps.fr'}.</Notice>
      <Card title="Option A — Formulaire intégré dans une page du site" actions={<button className="btn-secondary btn-sm" onClick={() => copy(snippetA)}>Copier</button>}><pre className="text-xs bg-paper border border-line rounded p-3 overflow-x-auto">{snippetA}</pre></Card>
      <Card title="Option B — Bouton vers la page d'inscription" actions={<button className="btn-secondary btn-sm" onClick={() => copy(snippetB)}>Copier</button>}><pre className="text-xs bg-paper border border-line rounded p-3 overflow-x-auto">{snippetB}</pre></Card>
      <Card title="API d'inscription"><dl className="text-sm space-y-2"><div><dt className="text-ink-soft">Point d'accès</dt><dd className="font-mono text-xs">POST {base}/api/public/subscribe</dd></div><div><dt className="text-ink-soft">Réponse</dt><dd className="font-mono text-xs">{'{ "ok": true, "message": "…" }'} · 400 données invalides · 403 clé/origine refusée · 429 trop de requêtes</dd></div><div><dt className="text-ink-soft">Documentation complète</dt><dd>documentation/api.md</dd></div></dl></Card>
    </div>
  );
}

function LogsTab() {
  const { user } = useAuth();
  const [kind, setKind] = useState<'email' | 'audit'>('email');
  const { data: emails } = useApi<any[]>(kind === 'email' ? '/api/admin/logs/email' : null, [kind]);
  const { data: audit } = useApi<any[]>(kind === 'audit' && isAdmin(user) ? '/api/admin/logs/audit' : null, [kind]);
  const { data: jobs } = useApi<any>('/api/admin/jobs');
  return (
    <div className="space-y-6">
      <div className="flex gap-2"><button className={kind === 'email' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setKind('email')}>Journal des envois</button>{isAdmin(user) && <button className={kind === 'audit' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setKind('audit')}>Journal d'audit</button>}</div>
      {kind === 'email' ? (
        <Card bodyClass="p-0"><div className="overflow-x-auto"><table className="table"><thead><tr><th>Date</th><th>Type</th><th>Destinataire</th><th>Objet</th><th>Statut</th><th>Réponse / erreur</th></tr></thead>
          <tbody>{(emails ?? []).map((l) => <tr key={l.id}><td className="whitespace-nowrap text-ink-soft">{fmtDate(l.created_at)}</td><td>{l.kind}{l.sandbox && <span className="ml-1 text-[10px] text-ink-soft">(bac à sable)</span>}</td><td className="break-all">{l.to_email}</td><td className="max-w-xs truncate">{l.subject}</td><td><Badge status={l.status === 'accepted' ? 'accepted' : 'failed'} label={l.status === 'accepted' ? 'Accepté' : l.status === 'bounced' ? 'Rebond' : 'Échec'} /></td><td className="text-xs text-ink-soft max-w-xs truncate" title={l.error ?? l.smtp_response}>{l.error ?? l.smtp_response}</td></tr>)}
            {emails?.length === 0 && <tr><td colSpan={6} className="text-ink-soft">Aucun envoi enregistré.</td></tr>}</tbody></table></div></Card>
      ) : (
        <Card bodyClass="p-0"><div className="overflow-x-auto"><table className="table"><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Objet</th><th>IP</th></tr></thead>
          <tbody>{(audit ?? []).map((a) => <tr key={a.id}><td className="whitespace-nowrap text-ink-soft">{fmtDate(a.created_at)}</td><td>{a.display_name ?? '—'}</td><td className="font-mono text-xs">{a.action}</td><td className="text-xs">{a.entity} {a.entity_id}</td><td className="text-xs text-ink-soft">{a.ip}</td></tr>)}</tbody></table></div></Card>
      )}
      <Card title="File d'attente"><ul className="text-sm grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{(jobs?.counts ?? []).map((j: any, i: number) => <li key={i} className="flex justify-between rounded border border-line px-3 py-2"><span className="font-mono text-xs">{j.job_type}</span><span><Badge status={j.status === 'done' ? 'ok' : j.status === 'failed' ? 'error' : 'draft'} label={`${j.status} : ${j.n}`} /></span></li>)}</ul></Card>
    </div>
  );
}

function UsersTab() {
  const { user } = useAuth();
  const { data, reload } = useApi<any[]>('/api/admin/users');
  const toast = useToast(); const confirm = useConfirm();
  const [f, setF] = useState({ email: '', displayName: '', role: 'editor', password: '' });
  return (
    <div className="grid xl:grid-cols-[1fr_380px] gap-6">
      <Card title="Comptes" bodyClass="p-0"><div className="overflow-x-auto"><table className="table"><thead><tr><th>Nom</th><th>Adresse</th><th>Rôle</th><th>2FA</th><th>Dernière connexion</th><th /></tr></thead>
        <tbody>{data?.map((u) => <tr key={u.id}><td>{u.display_name}</td><td>{u.email}</td><td>{({ admin: 'Administrateur', editor: 'Éditeur', viewer: 'Lecteur' } as any)[u.role]}</td><td>{u.totp_enabled ? <Badge status="ok" label="activée" /> : <Badge status="draft" label="non" />}</td><td className="text-ink-soft">{fmtRelative(u.last_login_at)}</td>
          <td>{u.id !== user?.id && <button className="btn-ghost btn-sm text-danger" onClick={async () => { if (await confirm({ title: 'Supprimer ce compte ?', message: u.email, danger: true, confirmLabel: 'Supprimer' })) { await del(`/api/admin/users/${u.id}`); toast('Compte supprimé.'); reload(); } }}>Supprimer</button>}</td></tr>)}</tbody></table></div></Card>
      <Card title="Ajouter un compte"><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); try { await post('/api/admin/users', f); toast('Compte créé.'); setF({ email: '', displayName: '', role: 'editor', password: '' }); reload(); } catch (err: any) { toast(err.message, 'danger'); } }}>
        <Field label="Nom" htmlFor="u-n"><input id="u-n" className="input" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} required /></Field>
        <Field label="Adresse e-mail" htmlFor="u-e"><input id="u-e" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Rôle" htmlFor="u-r"><select id="u-r" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="editor">Éditeur — crée et envoie des campagnes</option><option value="viewer">Lecteur — consultation seule</option><option value="admin">Administrateur — tous les droits</option></select></Field>
        <Field label="Mot de passe provisoire" htmlFor="u-p" hint="12 caractères minimum, lettres et chiffres. À transmettre par un canal sûr."><input id="u-p" type="password" autoComplete="new-password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <button className="btn-primary w-full"><KeyRound className="h-4 w-4" />Créer le compte</button>
      </form></Card>
    </div>
  );
}
