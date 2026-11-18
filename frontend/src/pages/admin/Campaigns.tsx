import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ban, CalendarClock, Check, ChevronLeft, ChevronRight, Copy, FlaskConical, Mail, PenSquare, Send, Trash2, Users } from 'lucide-react';
import { DEFAULT_SETTINGS, createBlock, renderEmail, type EmailDesign } from '@shared/index';
import { useApi } from '../../hooks/useApi';
import { canEdit, useAuth } from '../../hooks/useAuth';
import { del, get, post, put } from '../../services/api';
import { CAMPAIGN_STATUS, RECIPIENT_STATUS, TIMEZONES, fmtDate, fmtNum, fmtPct, utcToZoned, zonedToUtc } from '../../services/format';
import { Badge, Card, EmptyState, ErrorBox, Field, Notice, PageHeader, PageLoader, Pagination, Spinner, StatCard, useConfirm, useToast } from '../../components/ui';
import { EmailEditor } from '../../components/editor/EmailEditor';
import type { CampaignRow } from '../../types';

// ─── Liste ───
export function CampaignsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const qs = new URLSearchParams({ ...(status && { status }), ...(from && { from }), ...(to && { to }) });
  const { data, error, loading, reload } = useApi<CampaignRow[]>(`/api/admin/campaigns?${qs}`);
  return (
    <>
      <PageHeader title="Campagnes" crumbs={[{ label: 'Campagnes' }]} description="Historique de tous les envois, brouillons et campagnes programmées."
        actions={canEdit(user) && <Link to="/admin/campagnes/nouvelle" className="btn-primary no-underline"><Send className="h-4 w-4" />Nouvelle campagne</Link>} />
      <Card bodyClass="p-0">
        <div className="flex flex-wrap gap-3 p-4 border-b border-line items-end">
          <Field label="Statut" htmlFor="c-st"><select id="c-st" className="input sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tous</option>{Object.entries(CAMPAIGN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Créées du" htmlFor="c-from"><input id="c-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="au" htmlFor="c-to"><input id="c-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        {error && <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div>}
        {loading && !data ? <div className="p-8"><Spinner /></div> : data && data.length === 0 ? <EmptyState icon={Send} title="Aucune campagne" action={canEdit(user) ? <Link to="/admin/campagnes/nouvelle" className="btn-primary no-underline">Créer une campagne</Link> : undefined}>Une campagne = une newsletter + des destinataires + une date d'envoi.</EmptyState> : data && (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Campagne</th><th>Statut</th><th>Envoi</th><th className="text-right">Destinataires</th><th className="text-right">Acceptés</th><th className="text-right">Rebonds</th><th className="text-right">Clics (lecteurs)</th></tr></thead>
            <tbody>{data.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/admin/campagnes/${c.id}`} className="font-medium">{c.name}</Link><div className="text-xs text-ink-soft truncate max-w-xs">{c.subject}</div></td>
                <td><Badge status={c.status} /></td>
                <td className="whitespace-nowrap text-ink-soft">{c.status === 'scheduled' ? fmtDate(c.scheduled_at, c.timezone) : fmtDate(c.started_at ?? c.created_at)}</td>
                <td className="text-right tabular-nums">{fmtNum(c.recipient_count)}</td><td className="text-right tabular-nums">{fmtNum(c.accepted)}</td><td className="text-right tabular-nums">{fmtNum(c.bounced)}</td><td className="text-right tabular-nums">{fmtNum(c.clickers)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}

// ─── Programmation ───
export function SchedulingPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<CampaignRow[]>('/api/admin/campaigns?status=scheduled,queued,sending');
  const confirm = useConfirm(); const toast = useToast();
  return (
    <>
      <PageHeader title="Programmation" crumbs={[{ label: 'Programmation' }]} description="Les envois programmés sont exécutés par le worker côté serveur, même si votre navigateur est fermé. Une campagne n'est jamais envoyée deux fois." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <PageLoader /> : data && data.length === 0 ? <Card><EmptyState icon={CalendarClock} title="Aucun envoi programmé" action={canEdit(user) ? <Link to="/admin/campagnes/nouvelle" className="btn-primary no-underline">Programmer une campagne</Link> : undefined}>Choisissez « Programmer pour plus tard » à la dernière étape de l'assistant de campagne.</EmptyState></Card> : (
        <ul className="space-y-3">{data?.map((c) => (
          <li key={c.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="rounded-lg bg-info-soft text-info px-3 py-2 text-center shrink-0 min-w-[84px]"><p className="text-xs uppercase">{c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString('fr-FR', { timeZone: c.timezone, month: 'short' }) : ''}</p><p className="text-2xl font-display font-semibold leading-none">{c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString('fr-FR', { timeZone: c.timezone, day: 'numeric' }) : '—'}</p><p className="text-xs">{c.scheduled_at ? utcToZoned(c.scheduled_at, c.timezone).time : ''}</p></div>
              <div className="min-w-0"><Link to={`/admin/campagnes/${c.id}`} className="font-medium">{c.name}</Link><p className="text-sm text-ink-soft truncate">{c.subject}</p><p className="text-xs text-ink-soft">{fmtDate(c.scheduled_at, c.timezone)} ({c.timezone})</p></div>
            </div>
            <div className="flex items-center gap-2 shrink-0"><Badge status={c.status} />
              {canEdit(user) && c.status === 'scheduled' && <>
                <Link to={`/admin/campagnes/${c.id}/modifier`} className="btn-secondary btn-sm no-underline"><PenSquare className="h-4 w-4" />Modifier</Link>
                <button className="btn-secondary btn-sm text-danger" onClick={async () => { if (await confirm({ title: 'Annuler cet envoi programmé ?', message: `« ${c.name} » ne partira pas. Vous pourrez la reprogrammer.`, danger: true, confirmLabel: 'Annuler l\'envoi' })) { await post(`/api/admin/campaigns/${c.id}/cancel`); toast('Envoi annulé.'); reload(); } }}><Ban className="h-4 w-4" />Annuler</button>
              </>}
            </div>
          </li>))}</ul>
      )}
    </>
  );
}

// ─── Assistant ───
interface Draft { name: string; subject: string; preheader: string; fromName: string; fromEmail: string; replyTo: string; newsletterId: number | null; design: EmailDesign; audience: any; trackOpens: boolean }
const STEPS = ['Informations', 'Contenu', 'Destinataires', 'Test', 'Validation', 'Envoi'];

export function CampaignWizardPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate(); const toast = useToast();
  const [step, setStep] = useState(0);
  const [campaignId, setCampaignId] = useState<number | null>(id ? Number(id) : null);
  const [d, setD] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const { data: settings } = useApi<any>('/api/admin/settings');

  useEffect(() => {
    (async () => {
      try {
        if (id) {
          const { campaign: c } = await get(`/api/admin/campaigns/${id}`);
          if (!['draft', 'scheduled', 'cancelled'].includes(c.status)) { nav(`/admin/campagnes/${id}`, { replace: true }); return; }
          setD({ name: c.name, subject: c.subject, preheader: c.preheader ?? '', fromName: c.from_name, fromEmail: c.from_email, replyTo: c.reply_to ?? '', newsletterId: c.newsletter_id, design: c.design, audience: c.audience, trackOpens: c.track_opens });
        } else {
          const s = (await get('/api/admin/settings')).settings;
          let design: EmailDesign = { settings: { ...DEFAULT_SETTINGS }, blocks: [createBlock('heading'), createBlock('text'), createBlock('footer')] };
          let name = ''; const nid = params.get('newsletter');
          if (nid) { const n = await get(`/api/admin/newsletters/${nid}`); design = n.design; name = n.title; }
          setD({ name, subject: '', preheader: design.settings.preheader ?? '', fromName: s.sender.fromName, fromEmail: s.sender.fromEmail, replyTo: s.sender.replyTo, newsletterId: nid ? Number(nid) : null, design, audience: { type: 'all' }, trackOpens: false });
        }
      } catch (e: any) { setErr(e.message); }
    })();
  }, [id, params, nav]);

  useEffect(() => { if (d) post('/api/admin/audience/count', { audience: d.audience }).then((r) => setCount(r.count)).catch(() => setCount(null)); }, [d?.audience]); // eslint-disable-line

  const persist = async () => {
    if (!d) return false; setErr(null);
    const body = { ...d, preheader: d.preheader || null, replyTo: d.replyTo || '', design: { ...d.design, settings: { ...d.design.settings, preheader: d.preheader } } };
    try {
      if (campaignId) await put(`/api/admin/campaigns/${campaignId}`, body);
      else { const c = await post('/api/admin/campaigns', body); setCampaignId(c.id); window.history.replaceState(null, '', `/admin/campagnes/${c.id}/modifier`); }
      return true;
    } catch (e: any) { setErr(e.message); return false; }
  };
  const next = async () => {
    if (step === 0 && (!d?.name.trim() || !d?.subject.trim())) return setErr('Le nom interne et l\'objet sont obligatoires.');
    if (step === 2 && !count) return setErr('Aucun destinataire éligible pour cette sélection.');
    if (await persist()) { setStep(step + 1); window.scrollTo({ top: 0 }); }
  };

  if (err && !d) return <ErrorBox message={err} />;
  if (!d) return <PageLoader />;
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });

  return (
    <>
      <PageHeader title={campaignId ? 'Modifier la campagne' : 'Nouvelle campagne'} crumbs={[{ label: 'Campagnes', to: '/admin/campagnes' }, { label: d.name || 'Nouvelle campagne' }]} />
      <ol className="flex items-center gap-1 sm:gap-2 mb-6 overflow-x-auto pb-1" aria-label="Étapes">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button disabled={i > step} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] ${i === step ? 'bg-accent text-white' : i < step ? 'bg-ok-soft text-ok' : 'bg-panel border border-line text-ink-soft'}`}>
              <span className="h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-semibold bg-white/25">{i < step ? <Check className="h-3 w-3" /> : i + 1}</span><span className={i === step ? '' : 'hidden md:inline'}>{s}</span>
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-line" aria-hidden />}
          </li>
        ))}
      </ol>
      {err && <div className="mb-4"><ErrorBox message={err} /></div>}

      {step === 0 && (
        <Card title="1. Informations générales"><div className="grid md:grid-cols-2 gap-4 max-w-4xl">
          <Field label="Nom interne de la campagne" htmlFor="w-name" required hint="Visible uniquement dans le studio."><input id="w-name" className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={150} /></Field>
          <Field label="Objet de l'e-mail" htmlFor="w-subj" required hint={`${d.subject.length}/200 — idéalement moins de 60 caractères.`}><input id="w-subj" className="input" value={d.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={200} /></Field>
          <Field label="Texte d'aperçu" htmlFor="w-pre" hint="Affiché après l'objet dans la plupart des messageries."><input id="w-pre" className="input" value={d.preheader} onChange={(e) => set({ preheader: e.target.value })} maxLength={150} /></Field>
          <Field label="Nom de l'expéditeur" htmlFor="w-fn" required><input id="w-fn" className="input" value={d.fromName} onChange={(e) => set({ fromName: e.target.value })} /></Field>
          <Field label="Adresse d'expédition" htmlFor="w-fe" required hint="Doit appartenir au domaine sanctimaps.fr."><input id="w-fe" type="email" className="input" value={d.fromEmail} onChange={(e) => set({ fromEmail: e.target.value })} /></Field>
          <Field label="Adresse de réponse (facultative)" htmlFor="w-rt"><input id="w-rt" type="email" className="input" value={d.replyTo} onChange={(e) => set({ replyTo: e.target.value })} /></Field>
        </div></Card>
      )}
      {step === 1 && <StepContent d={d} set={set} />}
      {step === 2 && <StepAudience audience={d.audience} onChange={(audience) => set({ audience })} count={count} />}
      {step === 3 && campaignId && <StepTest campaignId={campaignId} defaultTo={settings?.settings?.organization?.contactEmail || ''} sandbox={settings?.sandbox} />}
      {step === 4 && <StepReview d={d} count={count} />}
      {step === 5 && campaignId && <StepSend campaignId={campaignId} count={count} sandbox={settings?.sandbox} onDone={(cid) => { toast('Campagne validée.'); nav(`/admin/campagnes/${cid}`); }} />}

      <div className="flex justify-between gap-3 mt-6">
        <button className="btn-secondary" onClick={() => (step === 0 ? nav('/admin/campagnes') : setStep(step - 1))}><ChevronLeft className="h-4 w-4" />{step === 0 ? 'Annuler' : 'Précédent'}</button>
        <div className="flex gap-2">
          {step < 5 && <button className="btn-ghost" onClick={async () => { if (await persist()) toast('Brouillon enregistré.'); }}>Enregistrer le brouillon</button>}
          {step < 5 && <button className="btn-primary" onClick={next}>Suivant<ChevronRight className="h-4 w-4" /></button>}
        </div>
      </div>
    </>
  );
}

function StepContent({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const { data: newsletters } = useApi<any[]>('/api/admin/newsletters');
  const { data: templates } = useApi<any[]>('/api/admin/templates');
  const confirm = useConfirm();
  const load = async (design: EmailDesign, newsletterId: number | null) => { if (await confirm({ title: 'Remplacer le contenu ?', message: 'Le contenu actuel de la campagne sera remplacé.', confirmLabel: 'Remplacer' })) set({ design: structuredClone(design), newsletterId }); };
  return (
    <div className="space-y-4">
      <Card title="2. Contenu" actions={<div className="flex gap-2 flex-wrap">
        <select className="input !min-h-[34px] !w-auto text-sm" value="" onChange={async (e) => { if (!e.target.value) return; const n = await get(`/api/admin/newsletters/${e.target.value}`); load(n.design, n.id); }} aria-label="Charger une newsletter"><option value="">Charger une newsletter…</option>{newsletters?.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</select>
        <select className="input !min-h-[34px] !w-auto text-sm" value="" onChange={(e) => { const t = templates?.find((x) => String(x.id) === e.target.value); if (t) load(t.design, null); }} aria-label="Charger un modèle"><option value="">Charger un modèle…</option>{templates?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </div>}><p className="text-sm text-ink-soft">Le contenu est figé au moment de l'envoi : modifier ensuite la newsletter d'origine ne change pas une campagne envoyée.</p></Card>
      <EmailEditor design={d.design} onChange={(design) => set({ design })} subject={d.subject} preheader={d.preheader} />
    </div>
  );
}

function StepAudience({ audience, onChange, count }: { audience: any; onChange: (a: any) => void; count: number | null }) {
  const { data: sources } = useApi<string[]>('/api/admin/subscribers/sources');
  const { data: segments, reload } = useApi<any[]>('/api/admin/segments');
  const [q, setQ] = useState('');
  const { data: subs } = useApi<any>(audience.type === 'selection' ? `/api/admin/subscribers?status=confirmed&pageSize=50&q=${encodeURIComponent(q)}` : null, [q]);
  const [segName, setSegName] = useState('');
  const toast = useToast();
  return (
    <Card title="3. Destinataires">
      <div className="grid lg:grid-cols-[1fr_260px] gap-6">
        <div className="space-y-3">
          {[['all', 'Tous les abonnés confirmés'], ['rules', 'Un segment (par source d\'inscription)'], ['segment', 'Un segment enregistré'], ['selection', 'Une sélection de contacts']].map(([t, l]) => (
            <label key={t} className={`flex items-start gap-3 rounded border p-3 cursor-pointer ${audience.type === t ? 'border-accent bg-accent-soft/40' : 'border-line'}`}>
              <input type="radio" name="aud" className="mt-1" checked={audience.type === t} onChange={() => onChange(t === 'all' ? { type: 'all' } : t === 'rules' ? { type: 'rules', sources: [] } : t === 'segment' ? { type: 'segment', segmentId: segments?.[0]?.id ?? 0 } : { type: 'selection', subscriberIds: [] })} />
              <span className="font-medium text-sm">{l}</span>
            </label>
          ))}
          {audience.type === 'rules' && (
            <div className="rounded border border-line p-3 space-y-2">
              <p className="text-sm font-medium">Sources incluses</p>
              <div className="flex flex-wrap gap-2">{sources?.map((s) => <label key={s} className="flex items-center gap-1.5 text-sm rounded-full border border-line px-3 py-1"><input type="checkbox" checked={audience.sources?.includes(s)} onChange={(e) => onChange({ ...audience, sources: e.target.checked ? [...(audience.sources ?? []), s] : audience.sources.filter((x: string) => x !== s) })} />{s}</label>)}</div>
              <div className="flex gap-2 items-end pt-2"><Field label="Enregistrer ce segment sous le nom" htmlFor="seg-n"><input id="seg-n" className="input" value={segName} onChange={(e) => setSegName(e.target.value)} /></Field><button className="btn-secondary" disabled={!segName} onClick={async () => { await post('/api/admin/segments', { name: segName, rules: { sources: audience.sources } }); toast('Segment enregistré.'); setSegName(''); reload(); }}>Enregistrer</button></div>
            </div>
          )}
          {audience.type === 'segment' && (segments?.length ? <select className="input" value={audience.segmentId} onChange={(e) => onChange({ type: 'segment', segmentId: Number(e.target.value) })}>{segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : <Notice tone="info">Aucun segment enregistré. Créez-en un avec l'option « par source d'inscription ».</Notice>)}
          {audience.type === 'selection' && (
            <div className="rounded border border-line">
              <div className="p-2 border-b border-line"><input className="input" placeholder="Rechercher parmi les abonnés confirmés…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un contact" /></div>
              <ul className="max-h-72 overflow-y-auto divide-y divide-line/70">{subs?.rows.map((s: any) => (
                <li key={s.id}><label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer"><input type="checkbox" checked={audience.subscriberIds.includes(s.id)} onChange={(e) => onChange({ ...audience, subscriberIds: e.target.checked ? [...audience.subscriberIds, s.id] : audience.subscriberIds.filter((x: number) => x !== s.id) })} />{s.email}<span className="text-ink-soft">{s.first_name}</span></label></li>
              ))}{subs?.rows.length === 0 && <li className="p-3 text-sm text-ink-soft">Aucun abonné confirmé.</li>}</ul>
            </div>
          )}
        </div>
        <div className="rounded-lg bg-paper border border-line p-4 h-fit text-center">
          <Users className="h-6 w-6 mx-auto text-teal" aria-hidden />
          <p className="text-[13px] text-ink-soft mt-2">Destinataires éligibles</p>
          <p className="text-4xl font-display font-semibold tabular-nums" aria-live="polite">{count == null ? '…' : fmtNum(count)}</p>
          <p className="text-xs text-ink-soft mt-2">Exclus automatiquement : en attente de confirmation, désinscrits, suspendus, adresses en erreur et liste d'exclusion.</p>
        </div>
      </div>
    </Card>
  );
}

function StepTest({ campaignId, defaultTo, sandbox }: { campaignId: number; defaultTo: string; sandbox?: boolean }) {
  const { user } = useAuth();
  const [to, setTo] = useState(defaultTo || user?.email || '');
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card title="4. E-mail de test">
      <div className="max-w-xl space-y-4">
        <p className="text-sm text-ink-soft">Le test est envoyé <strong>uniquement</strong> à l'adresse ci-dessous, avec l'objet préfixé « [TEST] ». Aucun abonné ne le reçoit.</p>
        {sandbox && <Notice tone="info" title="Mode bac à sable">Le message est capturé par la boîte de test locale : rien ne sort vers Internet.</Notice>}
        <div className="flex gap-2 items-end flex-wrap"><div className="flex-1 min-w-[220px]"><Field label="Adresse de test" htmlFor="t-to"><input id="t-to" type="email" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
          <button className="btn-primary" disabled={busy || !to} onClick={async () => { setErr(null); setBusy(true); try { setRes(await post(`/api/admin/campaigns/${campaignId}/test`, { to })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}><FlaskConical className="h-4 w-4" />{busy ? 'Envoi…' : 'Envoyer le test'}</button></div>
        {err && <ErrorBox message={err} />}
        {res && (res.status === 'accepted' ? <Notice tone="ok" title="Test accepté par le serveur d'envoi">Message {res.messageId}. « Accepté » ne garantit pas l'arrivée en boîte de réception : vérifiez-la.</Notice> : <Notice tone="danger" title="Test refusé">{res.error}</Notice>)}
        <p className="text-sm text-ink-soft">Étape facultative mais fortement recommandée.</p>
      </div>
    </Card>
  );
}

function StepReview({ d, count }: { d: Draft; count: number | null }) {
  const html = useMemo(() => renderEmail(d.design, { subject: d.subject, preheader: d.preheader, sampleData: true, unsubscribeUrl: '#', privacyUrl: '#', legalText: 'SanctiMaps — la carte mondiale des saints · sanctimaps.fr' }).html, [d]);
  const audienceLabel = d.audience.type === 'all' ? 'Tous les abonnés confirmés' : d.audience.type === 'rules' ? `Sources : ${(d.audience.sources ?? []).join(', ') || 'aucune'}` : d.audience.type === 'segment' ? 'Segment enregistré' : `${d.audience.subscriberIds.length} contact(s) sélectionné(s)`;
  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-6">
      <Card title="5. Récapitulatif"><dl className="text-sm space-y-3">
        {[['Nom de la campagne', d.name], ['Objet', d.subject], ['Texte d\'aperçu', d.preheader || '—'], ['Expéditeur', `${d.fromName} <${d.fromEmail}>`], ['Réponse à', d.replyTo || '—'], ['Destinataires', audienceLabel], ['Nombre de destinataires', count == null ? '…' : fmtNum(count)], ['Date d\'envoi', 'Choisie à l\'étape suivante']].map(([k, v]) => <div key={k}><dt className="text-ink-soft text-[13px]">{k}</dt><dd className="font-medium break-words">{v}</dd></div>)}
      </dl></Card>
      <Card title="Aperçu du message" bodyClass="p-0 bg-paper"><iframe title="Aperçu final" srcDoc={html} sandbox="" className="w-full h-[640px] border-0 rounded-b-lg" /></Card>
    </div>
  );
}

function StepSend({ campaignId, count, sandbox, onDone }: { campaignId: number; count: number | null; sandbox?: boolean; onDone: (id: number) => void }) {
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const tomorrow = utcToZoned(new Date(Date.now() + 86400000), 'Europe/Paris');
  const [date, setDate] = useState(tomorrow.date); const [time, setTime] = useState('07:00'); const [tz, setTz] = useState('Europe/Paris');
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const when = mode === 'schedule' ? zonedToUtc(date, time, tz) : null;
  const send = async () => {
    setErr(null); setBusy(true);
    try { await post(`/api/admin/campaigns/${campaignId}/send`, { mode, scheduledAt: when?.toISOString(), timezone: tz, confirm: true }); onDone(campaignId); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Card title="6. Envoi">
      <div className="max-w-2xl space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          {([['now', 'Envoyer maintenant', Send], ['schedule', 'Programmer pour plus tard', CalendarClock]] as const).map(([m, l, I]) => (
            <label key={m} className={`flex items-center gap-3 rounded border p-4 cursor-pointer ${mode === m ? 'border-accent bg-accent-soft/40' : 'border-line'}`}><input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} /><I className="h-5 w-5 text-accent" aria-hidden /><span className="font-medium">{l}</span></label>
          ))}
        </div>
        {mode === 'schedule' && (
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Date" htmlFor="s-date"><input id="s-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Heure" htmlFor="s-time"><input id="s-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            <Field label="Fuseau horaire" htmlFor="s-tz"><select id="s-tz" className="input" value={tz} onChange={(e) => setTz(e.target.value)}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <p className="sm:col-span-3 text-sm text-ink-soft">Départ prévu : <strong>{when ? fmtDate(when, tz) : '—'}</strong> ({tz}) — soit {when ? fmtDate(when, 'UTC') : '—'} UTC.</p>
          </div>
        )}
        {sandbox && <Notice tone="info" title="Mode bac à sable">Les {fmtNum(count)} messages seront capturés par la boîte de test locale. Aucun n'est envoyé sur Internet.</Notice>}
        <label className="flex items-start gap-3 rounded border border-warn/40 bg-warn-soft p-3 text-sm cursor-pointer">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          <span>Je confirme {mode === 'now' ? 'l\'envoi immédiat' : 'la programmation'} de cette campagne à <strong>{fmtNum(count)} abonné(s) confirmé(s)</strong>. J'ai vérifié l'objet, le contenu et les liens.</span>
        </label>
        {err && <ErrorBox message={err} />}
        <button className="btn-primary min-h-[46px] px-6" disabled={!ok || busy || !count} onClick={send}>{busy ? 'Validation…' : mode === 'now' ? `Envoyer à ${fmtNum(count)} destinataire(s)` : 'Programmer l\'envoi'}</button>
      </div>
    </Card>
  );
}

// ─── Fiche détaillée ───
export function CampaignDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate(); const toast = useToast(); const confirm = useConfirm();
  const { data, error, loading, reload } = useApi<any>(`/api/admin/campaigns/${id}`);
  const [rStatus, setRStatus] = useState(''); const [page, setPage] = useState(1);
  const { data: recipients } = useApi<any>(`/api/admin/campaigns/${id}/recipients?page=${page}${rStatus ? `&status=${rStatus}` : ''}`, [data?.stats?.accepted]);
  const live = data && ['queued', 'sending'].includes(data.campaign.status);
  useEffect(() => { if (!live) return; const t = setInterval(reload, 3000); return () => clearInterval(t); }, [live, reload]);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <PageLoader />;
  const { campaign: c, stats: s } = data;
  return (
    <>
      <PageHeader title={c.name} crumbs={[{ label: 'Campagnes', to: '/admin/campagnes' }, { label: c.name }]} description={<>Objet : « {c.subject} » · {c.from_name} &lt;{c.from_email}&gt;</>}
        actions={<>
          <Badge status={c.status} />
          {canEdit(user) && ['draft', 'cancelled', 'scheduled'].includes(c.status) && <Link to={`/admin/campagnes/${c.id}/modifier`} className="btn-secondary no-underline"><PenSquare className="h-4 w-4" />Modifier</Link>}
          {canEdit(user) && ['scheduled', 'queued', 'sending'].includes(c.status) && <button className="btn-secondary text-danger" onClick={async () => { if (await confirm({ title: c.status === 'sending' ? 'Interrompre l\'envoi ?' : 'Annuler la campagne ?', message: c.status === 'sending' ? 'Les messages déjà partis ne peuvent pas être rappelés ; les autres ne partiront pas.' : 'La campagne ne sera pas envoyée.', danger: true, confirmLabel: 'Confirmer' })) { await post(`/api/admin/campaigns/${c.id}/cancel`); toast('Campagne annulée.'); reload(); } }}><Ban className="h-4 w-4" />{c.status === 'sending' ? 'Interrompre' : 'Annuler'}</button>}
          {canEdit(user) && <button className="btn-secondary" onClick={async () => { const n = await post(`/api/admin/campaigns/${c.id}/duplicate`); nav(`/admin/campagnes/${n.id}/modifier`); }}><Copy className="h-4 w-4" />Dupliquer</button>}
          {canEdit(user) && c.status === 'draft' && !c.started_at && <button className="btn-ghost text-danger" onClick={async () => { if (await confirm({ title: 'Supprimer ce brouillon ?', message: 'Action définitive.', danger: true, confirmLabel: 'Supprimer' })) { await del(`/api/admin/campaigns/${c.id}`); nav('/admin/campagnes'); } }}><Trash2 className="h-4 w-4" /></button>}
        </>} />
      {live && <div className="mb-4"><Notice tone="info" title="Envoi en cours">Le worker traite la file par lots. Cette page se met à jour automatiquement ({s.pending} message(s) en attente).</Notice></div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 gap-3 mb-6">
        <StatCard label="Destinataires ciblés" value={fmtNum(s.targeted || c.recipient_count)} icon={Users} tone="info" />
        <StatCard label="Acceptés par le serveur" value={fmtNum(s.accepted)} icon={Mail} tone="teal" />
        <StatCard label="Rebonds" value={fmtNum(s.bounced)} icon={Ban} tone="danger" hint={s.failed ? `${s.failed} échec(s)` : undefined} />
        <StatCard label="Clics" value={fmtNum(s.clicks)} icon={Check} tone="gold" hint={`${fmtNum(s.unique_clickers)} lecteur(s)`} />
        <StatCard label="Taux de clics" value={fmtPct(s.click_rate)} icon={Check} tone="gold" hint="lecteurs ayant cliqué / acceptés" />
        <StatCard label="Désinscriptions" value={fmtNum(s.unsubscribes)} icon={Users} tone="accent" hint={s.complaints ? `${s.complaints} plainte(s)` : undefined} />
        <StatCard label="Ouvertures (estimation)" value={c.track_opens ? fmtNum(s.unique_opens) : 'non mesurées'} icon={Mail} tone="info" hint="peu fiables (protection de la vie privée)" />
      </div>
      <div className="grid xl:grid-cols-[1fr_420px] gap-6">
        <Card title="Destinataires" bodyClass="p-0" actions={<select className="input !min-h-[34px] !w-auto text-sm" value={rStatus} onChange={(e) => { setRStatus(e.target.value); setPage(1); }} aria-label="Filtrer par statut"><option value="">Tous les statuts</option>{Object.entries(RECIPIENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}>
          {!recipients ? <div className="p-4"><Spinner /></div> : recipients.rows.length === 0 ? <p className="p-5 text-sm text-ink-soft">{c.status === 'draft' || c.status === 'scheduled' ? 'La liste sera figée au moment de l\'envoi.' : 'Aucun destinataire pour ce filtre.'}</p> : (<>
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>Adresse</th><th>Statut</th><th>Envoi</th><th>Détail</th></tr></thead>
              <tbody>{recipients.rows.map((r: any) => <tr key={r.id}><td className="break-all">{r.email}</td><td><Badge status={r.status} label={RECIPIENT_STATUS[r.status]} /></td><td className="whitespace-nowrap text-ink-soft">{fmtDate(r.sent_at)}</td><td className="text-xs text-ink-soft max-w-xs truncate" title={r.last_error ?? ''}>{r.last_error ?? (r.attempts > 1 ? `${r.attempts} tentatives` : '')}</td></tr>)}</tbody></table></div>
            <Pagination page={page} pageSize={50} total={recipients.total} onPage={setPage} />
          </>)}
        </Card>
        <div className="space-y-6">
          <Card title="Historique"><dl className="text-sm grid grid-cols-2 gap-3">
            {[['Créée', fmtDate(c.created_at)], ['Programmée pour', c.scheduled_at ? `${fmtDate(c.scheduled_at, c.timezone)} (${c.timezone})` : '—'], ['Début d\'envoi', fmtDate(c.started_at)], ['Fin d\'envoi', fmtDate(c.finished_at)], ['Statut', CAMPAIGN_STATUS[c.status]], ['Incertains', s.uncertain ? `${s.uncertain} (non renvoyés)` : '0']].map(([k, v]) => <div key={k}><dt className="text-ink-soft text-[13px]">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl></Card>
          {s.links.length > 0 && <Card title="Clics par lien" bodyClass="p-0"><ul className="divide-y divide-line/70 text-sm">{s.links.map((l: any) => <li key={l.url} className="px-5 py-2 flex justify-between gap-3"><a href={l.url} target="_blank" rel="noreferrer" className="truncate">{l.url}</a><span className="tabular-nums font-medium">{l.clicks}</span></li>)}</ul></Card>}
          <Card title="Contenu envoyé" bodyClass="p-0 bg-paper"><iframe title="Contenu de la campagne" sandbox="" srcDoc={c.html_snapshot ?? renderEmail(c.design, { subject: c.subject, sampleData: true, unsubscribeUrl: '#', privacyUrl: '#', legalText: 'SanctiMaps' }).html} className="w-full h-[520px] border-0 rounded-b-lg" /></Card>
        </div>
      </div>
    </>
  );
}
