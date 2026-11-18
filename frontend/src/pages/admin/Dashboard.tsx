import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, CalendarClock, FileText, MailCheck, MousePointerClick, PenSquare, Send, UserMinus, UserPlus, Users } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { IS_DEMO } from '../../services/demo';
import { Badge, Card, EmptyState, ErrorBox, PageHeader, PageLoader, StatCard } from '../../components/ui';
import { PeriodPicker, periodQuery, type PeriodValue } from '../../components/PeriodPicker';
import { fmtDate, fmtNum, fmtRelative } from '../../services/format';

const axis = { stroke: 'rgb(var(--ink-soft))', fontSize: 12 };
const tooltipStyle = { contentStyle: { background: 'rgb(var(--panel))', border: '1px solid rgb(var(--line))', borderRadius: 10, fontSize: 13 }, labelStyle: { color: 'rgb(var(--ink))' } };
export const shortDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export default function Dashboard() {
  const [period, setPeriod] = useState<PeriodValue>({ period: '30d' });
  const { data, error, loading, reload } = useApi<any>(`/api/admin/dashboard?${periodQuery(period)}`);

  return (
    <>
      <PageHeader title="Tableau de bord" description={IS_DEMO ? "Vue d'ensemble. En démonstration, les chiffres sont calculés sur les données saisies dans ce navigateur ; aucun n'est inventé." : "Vue d'ensemble de la lettre de SanctiMaps. Tous les chiffres proviennent de la base de données ; aucun n'est estimé."}
        actions={<><PeriodPicker value={period} onChange={setPeriod} /><Link to="/admin/creer" className="btn-primary no-underline"><PenSquare className="h-4 w-4" />Créer une newsletter</Link></>} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <PageLoader /> : data && <DashboardBody d={data} />}
    </>
  );
}

function DashboardBody({ d }: { d: any }) {
  const hasSubscribers = d.totals.confirmed + d.totals.pending + d.totals.unsubscribed_total > 0;
  const hasSends = d.activity.some((x: any) => x.accepted || x.bounced || x.clicks);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3">
        <StatCard label="Abonnés confirmés" value={fmtNum(d.totals.confirmed)} icon={Users} tone="teal" hint={`${fmtNum(d.totals.pending)} en attente de confirmation`} />
        <StatCard label="Nouveaux abonnés (période)" value={fmtNum(d.totals.new_confirmed)} icon={UserPlus} tone="teal" hint={`${fmtNum(d.totals.new_signups)} demandes d'inscription`} />
        <StatCard label="Désinscriptions (période)" value={fmtNum(d.totals.unsubscribed_period)} icon={UserMinus} tone="gold" hint={`${fmtNum(d.totals.unsubscribed_total)} au total`} />
        <StatCard label="Newsletters créées" value={fmtNum(d.content.newsletters)} icon={FileText} tone="accent" />
        <StatCard label="Campagnes envoyées" value={fmtNum(d.content.campaigns_sent)} icon={Send} tone="accent" hint={d.content.campaigns_sending ? `${d.content.campaigns_sending} en cours` : undefined} />
        <StatCard label="Campagnes programmées" value={fmtNum(d.content.campaigns_scheduled)} icon={CalendarClock} tone="info" />
        <StatCard label="E-mails acceptés (période)" value={fmtNum(d.delivery.accepted)} icon={MailCheck} tone="teal" hint="par le serveur d'envoi — pas une preuve de lecture" />
        <StatCard label="Rebonds (période)" value={fmtNum(d.delivery.bounced)} icon={AlertOctagon} tone="danger" hint={d.delivery.failed ? `${d.delivery.failed} échecs` : undefined} />
        <StatCard label="Clics mesurés (période)" value={fmtNum(d.clicks.clicks)} icon={MousePointerClick} tone="gold" hint={`${fmtNum(d.clicks.unique_clickers)} lecteurs distincts`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Évolution du nombre d'abonnés">
          {!hasSubscribers ? <EmptyState icon={Users} title="Pas encore d'abonnés">Les courbes apparaîtront dès les premières inscriptions confirmées via <Link to="/inscription">la page d'inscription</Link> ou le formulaire du site.</EmptyState> : (
            <div className="h-64"><ResponsiveContainer><AreaChart data={d.growth} margin={{ left: -18, right: 8, top: 8 }}>
              <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="date" tickFormatter={shortDate} tick={axis} tickLine={false} axisLine={false} minTickGap={24} /><YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtDate(String(l), undefined, false)} />
              <Area animationDuration={350} type="monotone" dataKey="total" name="Abonnés actifs" stroke="var(--chart-2)" strokeWidth={2} fill="url(#g1)" />
            </AreaChart></ResponsiveContainer></div>)}
        </Card>
        <Card title="Inscriptions et désinscriptions">
          {!hasSubscribers ? <EmptyState icon={UserPlus} title="Aucune inscription sur la période" /> : (
            <div className="h-64"><ResponsiveContainer><BarChart data={d.growth} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="date" tickFormatter={shortDate} tick={axis} tickLine={false} axisLine={false} minTickGap={24} /><YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtDate(String(l), undefined, false)} cursor={{ fill: 'rgb(var(--line) / 0.4)' }} /><Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar animationDuration={350} dataKey="signups" name="Demandes" fill="var(--chart-3)" radius={[3, 3, 0, 0]} /><Bar animationDuration={350} dataKey="confirmations" name="Confirmations" fill="var(--chart-2)" radius={[3, 3, 0, 0]} /><Bar animationDuration={350} dataKey="unsubscribes" name="Désinscriptions" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
            </BarChart></ResponsiveContainer></div>)}
        </Card>
        <Card title="Activité des campagnes">
          {!hasSends ? <EmptyState icon={Send} title="Aucun envoi sur la période">Les messages acceptés, rebonds et clics s'afficheront ici après votre première campagne.</EmptyState> : (
            <div className="h-64"><ResponsiveContainer><LineChart data={d.activity} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="date" tickFormatter={shortDate} tick={axis} tickLine={false} axisLine={false} minTickGap={24} /><YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtDate(String(l), undefined, false)} /><Legend wrapperStyle={{ fontSize: 13 }} />
              <Line animationDuration={350} type="monotone" dataKey="accepted" name="Acceptés" stroke="var(--chart-2)" strokeWidth={2} dot={false} /><Line animationDuration={350} type="monotone" dataKey="clicks" name="Clics" stroke="var(--chart-3)" strokeWidth={2} dot={false} /><Line animationDuration={350} type="monotone" dataKey="bounced" name="Rebonds" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
            </LineChart></ResponsiveContainer></div>)}
        </Card>
        <Card title="Comparaison des performances" actions={<Link to="/admin/statistiques" className="text-sm">Statistiques détaillées</Link>}>
          {d.comparison.length === 0 ? <EmptyState icon={MousePointerClick} title="Aucune campagne à comparer">Envoyez au moins une campagne pour comparer acceptations, clics et désinscriptions.</EmptyState> : (
            <div className="h-64"><ResponsiveContainer><BarChart data={[...d.comparison].reverse()} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke="var(--chart-grid)" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={axis} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="name" width={110} tick={axis} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} cursor={{ fill: 'rgb(var(--line) / 0.4)' }} /><Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar animationDuration={350} dataKey="accepted" name="Acceptés" fill="var(--chart-2)" /><Bar animationDuration={350} dataKey="clickers" name="Lecteurs ayant cliqué" fill="var(--chart-3)" /><Bar animationDuration={350} dataKey="unsubscribes" name="Désinscriptions" fill="var(--chart-1)" />
            </BarChart></ResponsiveContainer></div>)}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
        <Activity title="Dernières inscriptions" empty="Aucune inscription pour l'instant." rows={d.recent.signups} link="/admin/abonnes"
          render={(r: any) => <><Link to={`/admin/abonnes?fiche=${r.id}`} className="truncate">{r.email}</Link><span className="flex items-center gap-2 shrink-0"><Badge status={r.status} /><span className="text-xs text-ink-soft">{fmtRelative(r.created_at)}</span></span></>} />
        <Activity title="Dernières campagnes" empty="Aucune campagne." rows={d.recent.campaigns} link="/admin/campagnes"
          render={(r: any) => <><Link to={`/admin/campagnes/${r.id}`} className="truncate">{r.name}</Link><span className="flex items-center gap-2 shrink-0"><Badge status={r.status} /><span className="text-xs text-ink-soft">{fmtRelative(r.updated_at)}</span></span></>} />
        <Activity title="Derniers envois" empty="Aucun e-mail envoyé." rows={d.recent.sends}
          render={(r: any) => <><span className="truncate">{r.subject} <span className="text-ink-soft">→ {r.to_email}</span></span><span className="flex items-center gap-2 shrink-0">{r.sandbox && <Badge status="draft" label="bac à sable" />}<Badge status={r.status === 'accepted' ? 'accepted' : 'failed'} label={r.status === 'accepted' ? 'Accepté' : r.status === 'bounced' ? 'Rebond' : 'Échec'} /></span></>} />
        <Activity title="Dernières désinscriptions" empty="Aucune désinscription." rows={d.recent.unsubscribes}
          render={(r: any) => <><span className="truncate">{r.email}</span><span className="text-xs text-ink-soft shrink-0">{fmtRelative(r.unsubscribed_at)}</span></>} />
        <Activity title="Dernières erreurs" empty="Aucune erreur enregistrée. 👍" rows={[...d.recent.errors, ...d.recent.jobErrors.map((j: any) => ({ subject: `Tâche ${j.job_type}`, error: j.last_error, created_at: j.created_at }))].slice(0, 6)} link="/admin/parametres?onglet=journaux"
          render={(r: any) => <><span className="truncate"><span className="text-danger">{r.error}</span> <span className="text-ink-soft">— {r.subject}{r.to_email ? ` → ${r.to_email}` : ''}</span></span><span className="text-xs text-ink-soft shrink-0">{fmtRelative(r.created_at)}</span></>} />
      </div>
    </div>
  );
}

function Activity({ title, rows, render, empty, link }: { title: string; rows: any[]; render: (r: any) => React.ReactNode; empty: string; link?: string }) {
  return (
    <Card title={title} actions={link ? <Link to={link} className="text-sm">Tout voir</Link> : undefined} bodyClass="p-0">
      {rows.length === 0 ? <p className="px-5 py-6 text-sm text-ink-soft">{empty}</p> : (
        <ul className="divide-y divide-line/70">{rows.map((r, i) => <li key={i} className="px-5 py-2.5 flex items-center justify-between gap-3 text-sm min-w-0">{render(r)}</li>)}</ul>
      )}
    </Card>
  );
}
