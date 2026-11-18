import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Eye, FileUp, Search, UserPlus, Users } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { canEdit, isAdmin, useAuth } from '../../hooks/useAuth';
import { del, download, patch, post, upload } from '../../services/api';
import { fmtDate, STATUS_LABELS } from '../../services/format';
import { Badge, Card, EmptyState, ErrorBox, Field, Modal, Notice, PageHeader, Pagination, Spinner, useConfirm, useToast } from '../../components/ui';
import type { Subscriber } from '../../types';

export default function Subscribers() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [sort, setSort] = useState('created_desc');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);
  const qs = new URLSearchParams({ q: debounced, status, source, sort, page: String(page), pageSize: '25' });
  const { data, error, loading, reload } = useApi<{ rows: Subscriber[]; total: number; counts: Record<string, number> }>(`/api/admin/subscribers?${qs}`);
  const { data: sources } = useApi<string[]>('/api/admin/subscribers/sources', [data?.total]);
  const openId = params.get('fiche');
  const totalAll = useMemo(() => Object.values(data?.counts ?? {}).reduce((a, b) => a + b, 0), [data]);

  return (
    <>
      <PageHeader title="Abonnés" crumbs={[{ label: 'Abonnés' }]} description="Seuls les abonnés « confirmés » (double opt-in) reçoivent les campagnes."
        actions={canEdit(user) && <>
          {isAdmin(user) && <button className="btn-secondary" onClick={() => download(`/api/admin/subscribers-export.csv?status=${status || 'confirmed'}`, `abonnes-${status || 'confirmed'}.csv`)}><Download className="h-4 w-4" />Exporter</button>}
          <button className="btn-secondary" onClick={() => setImporting(true)}><FileUp className="h-4 w-4" />Importer un CSV</button>
          <button className="btn-primary" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />Ajouter</button>
        </>} />

      <div className="flex gap-2 mb-4 flex-wrap" role="group" aria-label="Filtrer par statut">
        {[['', `Tous (${totalAll})`], ...Object.entries(STATUS_LABELS).map(([k, v]) => [k, `${v} (${data?.counts?.[k] ?? 0})`])].map(([k, v]) => (
          <button key={k} onClick={() => { setStatus(k); setPage(1); }} aria-pressed={status === k} className={`btn-sm rounded-full border px-3 text-[13px] ${status === k ? 'bg-ink text-panel border-ink' : 'bg-panel border-line text-ink-soft hover:text-ink'}`}>{v}</button>
        ))}
      </div>

      <Card bodyClass="p-0">
        <div className="flex flex-col md:flex-row gap-3 p-4 border-b border-line">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden />
            <label htmlFor="q" className="sr-only">Rechercher</label>
            <input id="q" className="input pl-9" placeholder="Rechercher un nom ou une adresse…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="sr-only" htmlFor="src">Source</label>
          <select id="src" className="input md:w-52" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
            <option value="">Toutes les sources</option>{(sources ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="sr-only" htmlFor="sort">Tri</label>
          <select id="sort" className="input md:w-56" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="created_desc">Plus récents d'abord</option><option value="created_asc">Plus anciens d'abord</option>
            <option value="confirmed_desc">Date de confirmation</option><option value="email_asc">Adresse A → Z</option><option value="email_desc">Adresse Z → A</option><option value="name_asc">Prénom A → Z</option>
          </select>
        </div>
        {error && <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div>}
        {loading && !data ? <div className="p-8"><Spinner /></div> : data && data.rows.length === 0 ? (
          <EmptyState icon={Users} title={debounced || status || source ? 'Aucun résultat' : 'Aucun abonné pour le moment'}
            action={!debounced && !status && canEdit(user) ? <a href="/inscription" target="_blank" className="btn-secondary no-underline">Voir la page d'inscription</a> : undefined}>
            {debounced || status || source ? 'Modifiez la recherche ou les filtres.' : 'Les inscriptions arriveront depuis la page d\'inscription, le formulaire du site principal ou un import CSV.'}
          </EmptyState>
        ) : data && (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="table">
                <thead><tr><th>Prénom</th><th>Nom</th><th>Adresse e-mail</th><th>Inscription</th><th>Confirmation</th><th>Source</th><th>Statut</th><th className="text-right">Actions</th></tr></thead>
                <tbody>
                  {data.rows.map((s) => (
                    <tr key={s.id}>
                      <td>{s.first_name ?? <span className="text-ink-soft">—</span>}</td>
                      <td>{s.last_name ?? <span className="text-ink-soft">—</span>}</td>
                      <td className="font-medium break-all">{s.email}</td>
                      <td className="whitespace-nowrap text-ink-soft">{fmtDate(s.subscribed_at, undefined, false)}</td>
                      <td className="whitespace-nowrap text-ink-soft">{fmtDate(s.confirmed_at, undefined, false)}</td>
                      <td><span className="text-[13px] text-ink-soft">{s.source}</span></td>
                      <td><Badge status={s.status} /></td>
                      <td className="text-right"><button className="btn-ghost btn-sm" onClick={() => setParams({ fiche: String(s.id) })}><Eye className="h-4 w-4" />Fiche</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-line">
              {data.rows.map((s) => (
                <li key={s.id}><button className="w-full text-left px-4 py-3 flex items-center justify-between gap-3" onClick={() => setParams({ fiche: String(s.id) })}>
                  <span className="min-w-0"><span className="block font-medium truncate">{s.email}</span><span className="block text-xs text-ink-soft">{[s.first_name, s.last_name].filter(Boolean).join(' ') || '—'} · {fmtDate(s.subscribed_at, undefined, false)} · {s.source}</span></span>
                  <Badge status={s.status} />
                </button></li>
              ))}
            </ul>
            <Pagination page={page} pageSize={25} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <AddSubscriber open={adding} onClose={() => setAdding(false)} onDone={reload} />
      <ImportWizard open={importing} onClose={() => setImporting(false)} onDone={reload} />
      {openId && <SubscriberSheet id={Number(openId)} onClose={() => setParams({})} onChange={reload} />}
    </>
  );
}

function AddSubscriber({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ email: '', firstName: '', lastName: '', sendConfirmation: true, consentNote: '' });
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    try { await post('/api/admin/subscribers', { ...f, firstName: f.firstName || null, lastName: f.lastName || null }); toast(f.sendConfirmation ? 'Abonné ajouté : invitation de confirmation envoyée.' : 'Abonné ajouté (en attente de confirmation).'); onDone(); onClose(); setF({ email: '', firstName: '', lastName: '', sendConfirmation: true, consentNote: '' }); }
    catch (e: any) { setErr(e.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Ajouter un abonné" footer={<><button className="btn-secondary" onClick={onClose}>Annuler</button><button className="btn-primary" form="add-sub">Ajouter</button></>}>
      <form id="add-sub" onSubmit={submit} className="space-y-4">
        <Notice tone="info">L'adresse sera enregistrée <strong>en attente de confirmation</strong>. Elle ne recevra aucune campagne tant que la personne n'aura pas cliqué sur le lien de confirmation.</Notice>
        <Field label="Adresse e-mail" htmlFor="a-email" required><input id="a-email" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Prénom" htmlFor="a-fn"><input id="a-fn" className="input" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field>
          <Field label="Nom" htmlFor="a-ln"><input id="a-ln" className="input" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field>
        </div>
        <Field label="Origine du consentement" htmlFor="a-cn" hint="Ex. : « Demande orale lors de la conférence du 12 mars »"><input id="a-cn" className="input" value={f.consentNote} onChange={(e) => setF({ ...f, consentNote: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.sendConfirmation} onChange={(e) => setF({ ...f, sendConfirmation: e.target.checked })} className="h-4 w-4" />Envoyer l'e-mail de confirmation (double opt-in)</label>
        {err && <ErrorBox message={err} />}
      </form>
    </Modal>
  );
}

function SubscriberSheet({ id, onClose, onChange }: { id: number; onClose: () => void; onChange: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, reload } = useApi<any>(`/api/admin/subscribers/${id}`);
  const [edit, setEdit] = useState<{ firstName: string; lastName: string; notes: string; tags: string } | null>(null);
  const s = data?.subscriber;
  useEffect(() => { if (s) setEdit({ firstName: s.first_name ?? '', lastName: s.last_name ?? '', notes: s.notes ?? '', tags: (s.tags ?? []).join(', ') }); }, [s]);
  const act = async (fn: () => Promise<any>, msg: string) => { try { await fn(); toast(msg); reload(); onChange(); } catch (e: any) { toast(e.message, 'danger'); } };

  return (
    <Modal open onClose={onClose} title="Fiche abonné" size="lg">
      {error ? <ErrorBox message={error} /> : !s || !edit ? <Spinner /> : (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div><p className="text-lg font-semibold break-all">{s.email}</p><p className="text-sm text-ink-soft">Source : {s.source} · inscrit le {fmtDate(s.subscribed_at)} · confirmé le {fmtDate(s.confirmed_at)}{s.unsubscribed_at ? ` · désinscrit le ${fmtDate(s.unsubscribed_at)}` : ''}</p></div>
            <Badge status={s.status} />
          </div>
          {canEdit(user) && (
            <form className="grid sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); act(() => patch(`/api/admin/subscribers/${id}`, { firstName: edit.firstName || null, lastName: edit.lastName || null, notes: edit.notes, tags: edit.tags.split(',').map((t) => t.trim()).filter(Boolean) }), 'Fiche enregistrée.'); }}>
              <Field label="Prénom" htmlFor="s-fn"><input id="s-fn" className="input" value={edit.firstName} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} /></Field>
              <Field label="Nom" htmlFor="s-ln"><input id="s-ln" className="input" value={edit.lastName} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} /></Field>
              <Field label="Étiquettes (séparées par des virgules)" htmlFor="s-tags"><input id="s-tags" className="input" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} /></Field>
              <Field label="Notes internes" htmlFor="s-notes"><input id="s-notes" className="input" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <button className="btn-primary btn-sm">Enregistrer</button>
                {s.status !== 'suspended' && s.status !== 'unsubscribed' && <button type="button" className="btn-secondary btn-sm" onClick={() => act(() => patch(`/api/admin/subscribers/${id}`, { status: 'suspended' }), 'Adresse suspendue.')}>Suspendre</button>}
                {s.status === 'suspended' && <button type="button" className="btn-secondary btn-sm" onClick={() => act(() => patch(`/api/admin/subscribers/${id}`, { status: 'restore' }), 'Suspension levée.')}>Lever la suspension</button>}
                {s.status !== 'unsubscribed' && <button type="button" className="btn-secondary btn-sm" onClick={async () => { if (await confirm({ title: 'Désinscrire cette adresse ?', message: 'Elle ne recevra plus aucune campagne et ne pourra être réinscrite que par la personne elle-même.', confirmLabel: 'Désinscrire', danger: true })) act(() => patch(`/api/admin/subscribers/${id}`, { status: 'unsubscribed' }), 'Adresse désinscrite.'); }}>Désinscrire</button>}
                {isAdmin(user) && <button type="button" className="btn-secondary btn-sm" onClick={() => download(`/api/admin/subscribers/${id}/export`, `donnees-abonne-${id}.json`)}><Download className="h-4 w-4" />Exporter ses données (RGPD)</button>}
                {isAdmin(user) && <button type="button" className="btn-danger btn-sm" onClick={async () => { if (await confirm({ title: 'Effacer les données de cette personne ?', message: <>L'adresse et le nom seront <strong>anonymisés de façon irréversible</strong>. Une empreinte chiffrée est conservée sur la liste d'exclusion pour ne jamais réimporter l'adresse par erreur.</>, confirmLabel: 'Anonymiser', danger: true })) { await act(() => del(`/api/admin/subscribers/${id}`), 'Données anonymisées.'); onClose(); } }}>Supprimer / anonymiser</button>}
              </div>
            </form>
          )}
          <section><h3 className="font-semibold mb-2">Preuves de consentement</h3>
            {data.consents.length === 0 ? <p className="text-sm text-ink-soft">Aucune.</p> : (
              <ul className="text-sm space-y-2">{data.consents.map((c: any, i: number) => <li key={i} className="rounded border border-line p-3"><span className="font-medium">{({ request: 'Demande d\'inscription', confirm: 'Confirmation (double opt-in)', unsubscribe: 'Désinscription', import: 'Import', admin_add: 'Ajout manuel', resubscribe_request: 'Nouvelle demande d\'inscription' } as any)[c.action] ?? c.action}</span> — {fmtDate(c.created_at)} · {c.source}{c.ip_truncated ? ` · IP ${c.ip_truncated}` : ''}{c.consent_text && <p className="text-ink-soft text-[13px] mt-1">« {c.consent_text} »</p>}</li>)}</ul>)}
          </section>
          <section><h3 className="font-semibold mb-2">Campagnes reçues</h3>
            {data.campaigns.length === 0 ? <p className="text-sm text-ink-soft">Aucune.</p> : <ul className="text-sm divide-y divide-line">{data.campaigns.map((c: any, i: number) => <li key={i} className="py-2 flex justify-between gap-3"><span>{c.name}</span><span className="text-ink-soft">{fmtDate(c.sent_at)} · <Badge status={c.status} label={c.status === 'accepted' ? 'Accepté' : c.status} /></span></li>)}</ul>}
          </section>
        </div>
      )}
    </Modal>
  );
}

function ImportWizard({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [sendConf, setSendConf] = useState(true);
  const [result, setResult] = useState<any>(null);
  const reset = () => { setStep(1); setPreview(null); setErr(null); setResult(null); setLabel(''); setNote(''); };
  const close = () => { reset(); onClose(); };
  const read = async (file: File) => {
    setErr(null); setBusy(true);
    const fd = new FormData(); fd.append('file', file);
    try { setPreview(await upload('/api/admin/subscribers/import/preview', fd)); setStep(2); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const valid = preview?.rows.filter((r: any) => r.status === 'ok') ?? [];
  const commit = async () => {
    setErr(null); setBusy(true);
    try { const r = await post('/api/admin/subscribers/import/commit', { rows: valid.map((r: any) => ({ email: r.email, firstName: r.firstName, lastName: r.lastName })), sourceLabel: label, consentNote: note, sendConfirmation: sendConf }); setResult(r); setStep(3); onDone(); toast(`${r.imported} adresse(s) importée(s).`); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const labels: Record<string, string> = { ok: 'À importer', invalid: 'Adresse invalide', duplicate_file: 'Doublon dans le fichier', exists: 'Déjà présent', suppressed: 'Liste d\'exclusion' };
  return (
    <Modal open={open} onClose={close} title={`Importer des contacts — étape ${step} sur 3`} size="lg"
      footer={step === 2 ? <><button className="btn-secondary" onClick={reset}>Changer de fichier</button><button className="btn-primary" disabled={busy || !valid.length || !label || note.length < 10} onClick={commit}>{busy ? 'Import…' : `Valider l'import de ${valid.length} adresse(s)`}</button></> : <button className="btn-secondary" onClick={close}>Fermer</button>}>
      {step === 1 && (
        <div className="space-y-4">
          <Notice tone="warn" title="Consentement obligatoire">N'importez que des personnes ayant explicitement accepté de recevoir la lettre. Les adresses importées restent <strong>en attente</strong> : elles ne deviennent abonnées qu'après avoir cliqué sur le lien de confirmation.</Notice>
          <label className="block border-2 border-dashed border-line rounded-lg p-8 text-center cursor-pointer hover:border-gold">
            <FileUp className="h-8 w-8 mx-auto text-ink-soft mb-2" aria-hidden />
            <span className="font-medium">Choisir un fichier CSV</span><span className="block text-sm text-ink-soft mt-1">Colonnes reconnues : email / e-mail / courriel, prénom, nom. Séparateur « ; » ou « , ». 2 Mo max.</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
          </label>
          {busy && <Spinner label="Lecture et vérification du fichier…" />}
          {err && <ErrorBox message={err} />}
        </div>
      )}
      {step === 2 && preview && (
        <div className="space-y-4">
          <p className="text-sm">Fichier <strong>{preview.filename}</strong> — {preview.total} ligne(s), séparateur « {preview.delimiter} ». Colonnes détectées : {Object.entries(preview.mapping).map(([k, v]) => `${k === 'email' ? 'e-mail' : k === 'first_name' ? 'prénom' : 'nom'} → « ${preview.columns[v as number]} »`).join(', ')}.</p>
          <div className="flex flex-wrap gap-2">{Object.entries(preview.summary).map(([k, v]) => <Badge key={k} status={k === 'ok' ? 'confirmed' : k === 'invalid' ? 'bounced' : 'pending'} label={`${labels[k]} : ${v}`} />)}</div>
          <div className="max-h-64 overflow-auto border border-line rounded">
            <table className="table"><thead><tr><th>Ligne</th><th>Adresse</th><th>Prénom</th><th>Nom</th><th>Vérification</th></tr></thead>
              <tbody>{preview.rows.slice(0, 200).map((r: any) => <tr key={r.line}><td>{r.line}</td><td className="break-all">{r.email}</td><td>{r.firstName}</td><td>{r.lastName}</td><td><Badge status={r.status === 'ok' ? 'confirmed' : r.status === 'invalid' ? 'bounced' : 'pending'} label={labels[r.status]} /></td></tr>)}</tbody></table>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nom de la source" htmlFor="i-label" required hint="Ex. : ancien tableur Google"><input id="i-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} /></Field>
            <Field label="Origine du consentement" htmlFor="i-note" required hint="Comment ces personnes ont-elles accepté ? (10 caractères min.)"><input id="i-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sendConf} onChange={(e) => setSendConf(e.target.checked)} className="h-4 w-4" />Envoyer à chacun l'e-mail de confirmation (recommandé)</label>
          {err && <ErrorBox message={err} />}
        </div>
      )}
      {step === 3 && result && <Notice tone="ok" title="Import terminé">{result.imported} adresse(s) importée(s) en attente de confirmation, {result.skipped} ignorée(s).</Notice>}
    </Modal>
  );
}
