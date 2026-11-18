import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Mail, MousePointerClick, Percent, Send, UserMinus, Workflow } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { isAdmin, useAuth } from '../../hooks/useAuth';
import { put } from '../../services/api';
import { fmtDate, fmtNum, fmtPct, fmtRelative } from '../../services/format';
import { Badge, Card, EmptyState, ErrorBox, Notice, PageHeader, PageLoader, StatCard, Toggle, useToast } from '../../components/ui';
import { PeriodPicker, periodQuery, type PeriodValue } from '../../components/PeriodPicker';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', '#9a4526', '#6b4f8c'];
const tt = { contentStyle: { background: 'rgb(var(--panel))', border: '1px solid rgb(var(--line))', borderRadius: 10, fontSize: 13 } };

export function StatisticsPage() {
  const [period, setPeriod] = useState<PeriodValue>({ period: '90d' });
  const { data, error, loading, reload } = useApi<any>(`/api/admin/stats/campaigns?${periodQuery(period)}`);
  const t = data?.totals;
  return (
    <>
      <PageHeader title="Statistiques" crumbs={[{ label: 'Statistiques' }]} description="Mesures issues d'événements réels : acceptations par le serveur d'envoi, rebonds, clics sur les liens suivis et désinscriptions." actions={<PeriodPicker value={period} onChange={setPeriod} />} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <PageLoader /> : data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
            <StatCard label="Destinataires ciblés" value={fmtNum(t.targeted)} icon={Send} tone="info" />
            <StatCard label="Messages acceptés" value={fmtNum(t.accepted)} icon={Mail} tone="teal" />
            <StatCard label="Rebonds" value={fmtNum(t.bounced)} icon={UserMinus} tone="danger" />
            <StatCard label="Clics" value={fmtNum(t.clicks)} icon={MousePointerClick} tone="gold" />
            <StatCard label="Taux de clics" value={t.accepted ? fmtPct((t.clickers / t.accepted) * 100) : '—'} icon={Percent} tone="gold" />
            <StatCard label="Désinscriptions" value={fmtNum(t.unsubscribes)} icon={UserMinus} tone="accent" />
          </div>
          <Notice tone="info" title="À propos des ouvertures">{data.opensTracked ? `Ouvertures estimées sur la période : ${fmtNum(t.opens)}. ` : 'La mesure des ouvertures est désactivée (choix respectueux de la vie privée). '}Les protections des messageries (Apple Mail notamment) chargent les images automatiquement : ce chiffre n'est qu'une estimation et n'est jamais utilisé comme indicateur principal.</Notice>
          {data.campaigns.length === 0 ? <Card><EmptyState icon={BarChart3} title="Aucune campagne envoyée sur cette période" action={<Link to="/admin/campagnes/nouvelle" className="btn-primary no-underline">Créer une campagne</Link>}>Changez de période ou envoyez votre première campagne.</EmptyState></Card> : (<>
            <Card title="Performances par campagne">
              <div className="h-72"><ResponsiveContainer><BarChart data={data.campaigns.map((c: any) => ({ name: c.name, Acceptés: c.stats.accepted, Rebonds: c.stats.bounced, 'Lecteurs ayant cliqué': c.stats.unique_clickers, Désinscriptions: c.stats.unsubscribes }))} margin={{ left: -10 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip {...tt} /><Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar animationDuration={350} dataKey="Acceptés" fill="var(--chart-2)" /><Bar animationDuration={350} dataKey="Lecteurs ayant cliqué" fill="var(--chart-3)" /><Bar animationDuration={350} dataKey="Rebonds" fill="var(--chart-1)" /><Bar animationDuration={350} dataKey="Désinscriptions" fill="var(--chart-4)" />
              </BarChart></ResponsiveContainer></div>
            </Card>
            <Card title="Rapport détaillé" bodyClass="p-0"><div className="overflow-x-auto"><table className="table">
              <thead><tr><th>Campagne</th><th>Envoyée</th><th className="text-right">Ciblés</th><th className="text-right">Acceptés</th><th className="text-right">Rebonds</th><th className="text-right">Clics</th><th className="text-right">Taux de clics</th><th className="text-right">Désinscr.</th></tr></thead>
              <tbody>{data.campaigns.map((c: any) => <tr key={c.id}><td><Link to={`/admin/campagnes/${c.id}`}>{c.name}</Link><div className="text-xs text-ink-soft">{c.subject}</div></td><td className="whitespace-nowrap text-ink-soft">{fmtDate(c.started_at)}</td><td className="text-right">{fmtNum(c.stats.targeted)}</td><td className="text-right">{fmtNum(c.stats.accepted)}</td><td className="text-right">{fmtNum(c.stats.bounced)}</td><td className="text-right">{fmtNum(c.stats.clicks)}</td><td className="text-right">{fmtPct(c.stats.click_rate)}</td><td className="text-right">{fmtNum(c.stats.unsubscribes)}</td></tr>)}</tbody>
            </table></div></Card>
          </>)}
          <Card title="Abonnés confirmés par source">
            {data.sources.length === 0 ? <p className="text-sm text-ink-soft">Aucun abonné confirmé pour l'instant.</p> : (
              <div className="grid md:grid-cols-[260px_1fr] gap-6 items-center">
                <div className="h-56"><ResponsiveContainer><PieChart><Pie animationDuration={350} data={data.sources} dataKey="n" nameKey="source" innerRadius={50} outerRadius={90} paddingAngle={2}>{data.sources.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tt} /></PieChart></ResponsiveContainer></div>
                <ul className="text-sm space-y-1">{data.sources.map((s: any, i: number) => <li key={s.source} className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{s.source}<span className="ml-auto font-medium tabular-nums">{fmtNum(s.n)}</span></li>)}</ul>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

export function AutomationsPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<any>('/api/admin/automations');
  const toast = useToast();
  const save = async (a: any, patch: any) => { try { await put(`/api/admin/automations/${a.key}`, { enabled: a.enabled, config: a.config, ...patch }); toast('Automatisation enregistrée.'); reload(); } catch (e: any) { toast(e.message, 'danger'); } };
  const runLabel: Record<string, string> = { welcome_email: 'Bienvenue', admin_signup_notification: 'Notification', editorial_reminder: 'Relance éditoriale', inactive_subscribers: 'Inactifs', purge_unconfirmed: 'Purge' };
  return (
    <>
      <PageHeader title="Automatisations" crumbs={[{ label: 'Automatisations' }]} description="Chaque automatisation est désactivable. Aucune n'envoie de message publicitaire automatique : seulement des messages transactionnels ou des alertes à l'administrateur." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <PageLoader /> : data && (
        <div className="grid xl:grid-cols-[1fr_400px] gap-6">
          <div className="space-y-4">{data.automations.map((a: any) => <AutomationCard key={a.key} a={a} editable={isAdmin(user)} onSave={(p) => save(a, p)} />)}</div>
          <Card title="Exécutions récentes" bodyClass="p-0">
            {data.runs.length === 0 ? <EmptyState icon={Workflow} title="Aucune exécution">Les traces des automatisations exécutées apparaîtront ici.</EmptyState> : (
              <ul className="divide-y divide-line/70 text-sm max-h-[70vh] overflow-y-auto">{data.runs.map((r: any) => <li key={r.id} className="px-5 py-2.5"><div className="flex justify-between gap-2"><span className="font-medium">{runLabel[r.automation_key] ?? r.automation_key}</span><Badge status={r.status === 'ok' ? 'ok' : r.status === 'error' ? 'error' : 'draft'} label={r.status} /></div><p className="text-xs text-ink-soft">{fmtRelative(r.created_at)} · {Object.entries(r.detail ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p></li>)}</ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function AutomationCard({ a, editable, onSave }: { a: any; editable: boolean; onSave: (p: any) => void }) {
  const [cfg, setCfg] = useState<any>(a.config);
  const fields: Record<string, [string, string, string][]> = {
    welcome_email: [['subject', 'Objet', 'text'], ['body', 'Message', 'textarea']],
    admin_signup_notification: [['to', 'Adresse à prévenir (vide = administrateur principal)', 'email']],
    editorial_reminder: [['days', 'Délai sans lettre (jours)', 'number'], ['to', 'Adresse à prévenir (vide = administrateur principal)', 'email']],
    inactive_subscribers: [['months', 'Sans clic depuis (mois)', 'number']],
    purge_unconfirmed: [['days', 'Supprimer les inscriptions non confirmées après (jours)', 'number']],
  };
  return (
    <Card>
      <Toggle checked={a.enabled} disabled={!editable} onChange={(v) => onSave({ enabled: v, config: cfg })} label={a.name} description={a.description} />
      <div className="mt-4 grid gap-3">
        {(fields[a.key] ?? []).map(([k, label, type]) => (
          <div key={k}><label className="label" htmlFor={`${a.key}-${k}`}>{label}</label>
            {type === 'textarea' ? <textarea id={`${a.key}-${k}`} className="input" rows={3} disabled={!editable} value={cfg[k] ?? ''} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} />
              : <input id={`${a.key}-${k}`} type={type} className="input" disabled={!editable} value={cfg[k] ?? ''} onChange={(e) => setCfg({ ...cfg, [k]: type === 'number' ? Number(e.target.value) : e.target.value })} />}
          </div>
        ))}
        {editable && fields[a.key]?.length > 0 && <div><button className="btn-secondary btn-sm" onClick={() => onSave({ config: cfg })}>Enregistrer les réglages</button></div>}
      </div>
    </Card>
  );
}
