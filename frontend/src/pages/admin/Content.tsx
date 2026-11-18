import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Copy, FilePlus2, FileText, LayoutTemplate, PenSquare, Save, Send, Trash2 } from 'lucide-react';
import { DEFAULT_SETTINGS, createBlock, renderEmail, type EmailDesign } from '@shared/index';
import { useApi } from '../../hooks/useApi';
import { canEdit, useAuth } from '../../hooks/useAuth';
import { del, get, post, put } from '../../services/api';
import { fmtDate, fmtRelative } from '../../services/format';
import { Card, EmptyState, ErrorBox, Modal, PageHeader, PageLoader, useConfirm, useToast } from '../../components/ui';
import { EmailEditor } from '../../components/editor/EmailEditor';
import type { Template } from '../../types';

const blankDesign = (): EmailDesign => ({ settings: { ...DEFAULT_SETTINGS }, blocks: [createBlock('heading'), createBlock('text'), createBlock('footer')] });

function Thumb({ design }: { design: EmailDesign }) {
  const html = useMemo(() => renderEmail(design, { subject: '', sampleData: true, unsubscribeUrl: '#', privacyUrl: '#', legalText: 'SanctiMaps' }).html, [design]);
  return (
    <div className="relative h-56 overflow-hidden rounded-t-lg bg-paper border-b border-line" aria-hidden>
      <iframe title="" srcDoc={html} tabIndex={-1} sandbox="" className="pointer-events-none absolute top-0 left-0 origin-top-left border-0" style={{ width: 680, height: 900, transform: 'scale(0.42)' }} />
    </div>
  );
}

export function NewslettersPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<any[]>('/api/admin/newsletters');
  const confirm = useConfirm(); const toast = useToast(); const nav = useNavigate();
  return (
    <>
      <PageHeader title="Newsletters" crumbs={[{ label: 'Newsletters' }]} description="Vos contenus enregistrés. Une newsletter peut être envoyée dans une ou plusieurs campagnes."
        actions={canEdit(user) && <Link to="/admin/creer" className="btn-primary no-underline"><FilePlus2 className="h-4 w-4" />Nouvelle newsletter</Link>} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <PageLoader /> : data && (data.length === 0 ? <Card><EmptyState icon={FileText} title="Aucune newsletter" action={<Link to="/admin/creer" className="btn-primary no-underline">Créer la première</Link>}>Partez d'un des six modèles SanctiMaps ou d'une page blanche.</EmptyState></Card> : (
        <Card bodyClass="p-0"><div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Titre</th><th>Blocs</th><th>Campagnes</th><th>Modifiée</th><th className="text-right">Actions</th></tr></thead>
          <tbody>{data.map((n) => (
            <tr key={n.id}>
              <td><Link to={`/admin/newsletters/${n.id}`} className="font-medium">{n.title}</Link><div className="text-xs text-ink-soft">créée le {fmtDate(n.created_at, undefined, false)}</div></td>
              <td>{n.block_count}</td><td>{n.campaign_count}</td><td className="text-ink-soft whitespace-nowrap">{fmtRelative(n.updated_at)}</td>
              <td className="text-right whitespace-nowrap">
                <Link to={`/admin/newsletters/${n.id}`} className="btn-ghost btn-sm no-underline"><PenSquare className="h-4 w-4" />Modifier</Link>
                {canEdit(user) && <>
                  <Link to={`/admin/campagnes/nouvelle?newsletter=${n.id}`} className="btn-ghost btn-sm no-underline"><Send className="h-4 w-4" />Envoyer</Link>
                  <button className="btn-ghost btn-sm" onClick={async () => { const c = await post(`/api/admin/newsletters/${n.id}/duplicate`); toast('Newsletter dupliquée.'); nav(`/admin/newsletters/${c.id}`); }}><Copy className="h-4 w-4" /><span className="sr-only">Dupliquer</span></button>
                  <button className="btn-ghost btn-sm text-danger" onClick={async () => { if (await confirm({ title: 'Supprimer cette newsletter ?', message: `« ${n.title} » sera supprimée. Les campagnes déjà envoyées conservent leur contenu.`, danger: true, confirmLabel: 'Supprimer' })) { await del(`/api/admin/newsletters/${n.id}`); toast('Newsletter supprimée.'); reload(); } }}><Trash2 className="h-4 w-4" /><span className="sr-only">Supprimer</span></button>
                </>}
              </td>
            </tr>))}</tbody>
        </table></div></Card>
      ))}
    </>
  );
}

function TemplateGallery({ onPick }: { onPick: (design: EmailDesign, templateId: number | null, name: string) => void }) {
  const { data, error, loading } = useApi<Template[]>('/api/admin/templates');
  return (
    <>
      {error && <ErrorBox message={error} />}
      {loading ? <PageLoader /> : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <li><button onClick={() => onPick(blankDesign(), null, 'Nouvelle newsletter')} className="card w-full h-full min-h-[300px] flex flex-col items-center justify-center gap-2 border-dashed hover:border-gold"><FilePlus2 className="h-8 w-8 text-accent" /><span className="font-medium">Page blanche</span><span className="text-xs text-ink-soft">Titre, texte et pied de page</span></button></li>
          {data?.map((t) => (
            <li key={t.id}><button onClick={() => onPick(t.design, t.id, t.name)} className="card w-full text-left overflow-hidden hover:border-gold hover:shadow-pop transition-shadow">
              <Thumb design={t.design} />
              <div className="p-3"><p className="font-medium">{t.name}</p><p className="text-xs text-ink-soft line-clamp-2">{t.description}</p></div>
            </button></li>
          ))}
        </ul>
      )}
    </>
  );
}

/** /admin/creer et /admin/newsletters/:id */
export function NewsletterEditorPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate(); const toast = useToast();
  const [design, setDesign] = useState<EmailDesign | null>(null);
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(id ? Number(id) : null);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saveTpl, setSaveTpl] = useState(false);
  const [tplName, setTplName] = useState('');

  useEffect(() => {
    if (!id) { setDesign(null); setSavedId(null); return; }
    get(`/api/admin/newsletters/${id}`).then((n) => { setDesign(n.design); setTitle(n.title); setSavedId(n.id); setDirty(false); }).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = async () => {
    if (!design) return; setErr(null);
    try {
      if (savedId) await put(`/api/admin/newsletters/${savedId}`, { title: title || 'Sans titre', design });
      else { const n = await post('/api/admin/newsletters', { title: title || 'Sans titre', design, templateId }); setSavedId(n.id); nav(`/admin/newsletters/${n.id}`, { replace: true }); }
      setDirty(false); toast('Newsletter enregistrée.');
      return true;
    } catch (e: any) { setErr(e.message); toast(e.message, 'danger'); return false; }
  };

  if (err && !design) return <ErrorBox message={err} />;
  if (!design) {
    if (id) return <PageLoader />;
    return (<>
      <PageHeader title="Créer une newsletter" crumbs={[{ label: 'Newsletters', to: '/admin/newsletters' }, { label: 'Créer' }]} description="Choisissez un point de départ. Tout reste modifiable." />
      <TemplateGallery onPick={(d, tid, name) => { setDesign(structuredClone(d)); setTemplateId(tid); setTitle(name === 'Nouvelle newsletter' ? '' : `${name} — ${new Date().toLocaleDateString('fr-FR')}`); setDirty(true); }} />
    </>);
  }
  return (
    <>
      <PageHeader title={savedId ? 'Modifier la newsletter' : 'Créer une newsletter'} crumbs={[{ label: 'Newsletters', to: '/admin/newsletters' }, { label: title || 'Nouvelle newsletter' }]}
        actions={canEdit(user) && <>
          {dirty && <span className="text-[13px] text-warn">Modifications non enregistrées</span>}
          <button className="btn-secondary" onClick={() => { setTplName(title); setSaveTpl(true); }}><LayoutTemplate className="h-4 w-4" />Enregistrer comme modèle</button>
          <button className="btn-secondary" onClick={async () => { if (await save()) nav(`/admin/campagnes/nouvelle?newsletter=${savedId ?? ''}`); }} disabled={!savedId && !dirty}><Send className="h-4 w-4" />Créer une campagne</button>
          <button className="btn-primary" onClick={save}><Save className="h-4 w-4" />Enregistrer</button>
        </>} />
      <div className="mb-4 max-w-xl"><label className="label" htmlFor="nl-title">Titre interne</label><input id="nl-title" className="input" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} placeholder="Ex. : Lettre du 1er décembre — saint Éloi" maxLength={150} /></div>
      {err && <div className="mb-4"><ErrorBox message={err} /></div>}
      <EmailEditor design={design} onChange={(d) => { setDesign(d); setDirty(true); }} />
      <Modal open={saveTpl} onClose={() => setSaveTpl(false)} title="Enregistrer comme modèle" size="sm"
        footer={<><button className="btn-secondary" onClick={() => setSaveTpl(false)}>Annuler</button><button className="btn-primary" disabled={!tplName.trim()} onClick={async () => { try { await post('/api/admin/templates', { name: tplName, description: 'Modèle personnalisé', design }); toast('Modèle enregistré.'); setSaveTpl(false); } catch (e: any) { toast(e.message, 'danger'); } }}>Enregistrer</button></>}>
        <label className="label" htmlFor="tpl-name">Nom du modèle</label><input id="tpl-name" className="input" value={tplName} onChange={(e) => setTplName(e.target.value)} data-autofocus />
      </Modal>
    </>
  );
}

export function TemplatesPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<Template[]>('/api/admin/templates');
  const confirm = useConfirm(); const toast = useToast(); const nav = useNavigate();
  return (
    <>
      <PageHeader title="Modèles" crumbs={[{ label: 'Modèles' }]} description="Six modèles SanctiMaps prêts à l'emploi et vos propres modèles. Tous sont modifiables et enregistrés en base."
        actions={canEdit(user) && <button className="btn-primary" onClick={async () => { const t = await post('/api/admin/templates', { name: 'Nouveau modèle', description: '', design: blankDesign() }); nav(`/admin/modeles/${t.id}`); }}><FilePlus2 className="h-4 w-4" />Créer un modèle</button>} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <PageLoader /> : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data?.map((t) => (
            <li key={t.id} className="card overflow-hidden flex flex-col">
              <Thumb design={t.design} />
              <div className="p-3 flex-1"><p className="font-medium flex items-center gap-2">{t.name}{t.is_system && <span className="text-[10px] uppercase tracking-wide bg-gold-soft text-gold rounded px-1.5 py-0.5">SanctiMaps</span>}</p><p className="text-xs text-ink-soft">{t.description}</p></div>
              {canEdit(user) && <div className="px-3 pb-3 flex gap-1 flex-wrap">
                <Link to={`/admin/creer?modele=${t.id}`} className="btn-primary btn-sm no-underline">Utiliser</Link>
                <Link to={`/admin/modeles/${t.id}`} className="btn-secondary btn-sm no-underline">Modifier</Link>
                <button className="btn-ghost btn-sm" onClick={async () => { await post(`/api/admin/templates/${t.id}/duplicate`); toast('Modèle dupliqué.'); reload(); }}><Copy className="h-4 w-4" /><span className="sr-only">Dupliquer</span></button>
                <button className="btn-ghost btn-sm text-danger" onClick={async () => { if (await confirm({ title: 'Supprimer ce modèle ?', message: `« ${t.name} » sera supprimé définitivement.`, danger: true, confirmLabel: 'Supprimer' })) { await del(`/api/admin/templates/${t.id}`); toast('Modèle supprimé.'); reload(); } }}><Trash2 className="h-4 w-4" /><span className="sr-only">Supprimer</span></button>
              </div>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function TemplateEditorPage() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error } = useApi<Template>(`/api/admin/templates/${id}`);
  const [design, setDesign] = useState<EmailDesign | null>(null);
  const [name, setName] = useState(''); const [description, setDescription] = useState('');
  useEffect(() => { if (data) { setDesign(data.design); setName(data.name); setDescription(data.description ?? ''); } }, [data]);
  if (error) return <ErrorBox message={error} />;
  if (!design) return <PageLoader />;
  return (
    <>
      <PageHeader title="Modifier le modèle" crumbs={[{ label: 'Modèles', to: '/admin/modeles' }, { label: name }]}
        actions={<button className="btn-primary" onClick={async () => { try { await put(`/api/admin/templates/${id}`, { name, description, design }); toast('Modèle enregistré.'); } catch (e: any) { toast(e.message, 'danger'); } }}><Save className="h-4 w-4" />Enregistrer le modèle</button>} />
      <div className="grid sm:grid-cols-2 gap-4 mb-4 max-w-3xl">
        <div><label className="label" htmlFor="t-name">Nom</label><input id="t-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="t-desc">Description</label><input id="t-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      </div>
      <EmailEditor design={design} onChange={setDesign} />
    </>
  );
}

/** Ouverture directe d'un modèle depuis la page Modèles (/admin/creer?modele=ID). */
export function CreateFromTemplateRedirect() {
  const [params] = useSearchParams();
  return <NewsletterEditorFromTemplate templateId={params.get('modele')} />;
}
function NewsletterEditorFromTemplate({ templateId }: { templateId: string | null }) {
  const nav = useNavigate(); const toast = useToast();
  useEffect(() => {
    if (!templateId) return;
    get(`/api/admin/templates/${templateId}`).then((t) => post('/api/admin/newsletters', { title: `${t.name} — ${new Date().toLocaleDateString('fr-FR')}`, design: t.design, templateId: t.id }))
      .then((n) => nav(`/admin/newsletters/${n.id}`, { replace: true })).catch((e) => toast(e.message, 'danger'));
  }, [templateId, nav, toast]);
  return templateId ? <PageLoader /> : <NewsletterEditorPage />;
}
