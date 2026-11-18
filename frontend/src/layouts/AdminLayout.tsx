import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarClock, ClipboardCheck, FileText, LayoutDashboard, LayoutTemplate, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, PenSquare, Send, Settings, Sun, UserCog, UserRound, Users, Workflow, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { PageLoader } from '../components/ui';

export const NAV = [
  { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/admin/abonnes', label: 'Abonnés', icon: Users },
  { to: '/admin/newsletters', label: 'Newsletters', icon: FileText },
  { to: '/admin/creer', label: 'Créer une newsletter', icon: PenSquare },
  { to: '/admin/campagnes', label: 'Campagnes', icon: Send },
  { to: '/admin/programmation', label: 'Programmation', icon: CalendarClock },
  { to: '/admin/modeles', label: 'Modèles', icon: LayoutTemplate },
  { to: '/admin/automatisations', label: 'Automatisations', icon: Workflow },
  { to: '/admin/statistiques', label: 'Statistiques', icon: BarChart3 },
  { to: '/admin/parametres', label: 'Paramètres', icon: Settings },
];

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('snl.theme', theme); } catch { /* stockage indisponible */ }
  }, [theme]);
  return [theme, setTheme] as const;
}

export default function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('snl.sidebar') === 'collapsed'; } catch { return false; } });
  const [theme, setTheme] = useTheme();
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setMobileOpen(false), [loc.pathname]);
  useEffect(() => { try { localStorage.setItem('snl.sidebar', collapsed ? 'collapsed' : 'open'); } catch { /* */ } }, [collapsed]);

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/admin/connexion?suite=${encodeURIComponent(loc.pathname)}`} replace />;

  const link = (item: typeof NAV[number], compact: boolean) => (
    <NavLink key={item.to} to={item.to} end={item.end} title={compact ? item.label : undefined}
      className={({ isActive }) => `group flex items-center gap-3 rounded px-3 py-2.5 text-[14px] no-underline transition-colors ${isActive ? 'bg-accent text-white font-medium' : 'text-ink hover:bg-paper'} ${compact ? 'justify-center px-0' : ''}`}>
      <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden /><span className={compact ? 'sr-only' : ''}>{item.label}</span>
    </NavLink>
  );

  const sidebar = (compact: boolean) => (
    <div className="flex flex-col h-full">
      <div className={`flex items-center gap-3 px-4 py-4 border-b border-line ${compact ? 'justify-center px-2' : ''}`}>
        <img src="/logo.png" alt="" className="h-10 w-10 rounded-[10px] shadow-card" />
        {!compact && <div className="leading-tight"><p className="font-display font-semibold text-[17px] text-ink">SanctiMaps</p><p className="text-[12px] text-ink-soft tracking-wide uppercase">Newsletter Studio</p></div>}
      </div>
      <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto p-3 space-y-0.5">{NAV.map((i) => link(i, compact))}</nav>
      <div className="p-3 border-t border-line space-y-0.5">
        {link({ to: '/admin/projet', label: 'Suivi du cahier des charges', icon: ClipboardCheck }, compact)}
        {link({ to: '/admin/profil', label: 'Profil administrateur', icon: UserRound }, compact)}
        {link({ to: '/admin/compte', label: 'Paramètres du compte', icon: UserCog }, compact)}
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={`w-full flex items-center gap-3 rounded px-3 py-2.5 text-[14px] text-ink hover:bg-paper ${compact ? 'justify-center px-0' : ''}`} title="Changer de thème">
          {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}<span className={compact ? 'sr-only' : ''}>{theme === 'dark' ? 'Thème clair' : 'Thème sombre'}</span>
        </button>
        <button onClick={async () => { await logout(); nav('/admin/connexion'); }} className={`w-full flex items-center gap-3 rounded px-3 py-2.5 text-[14px] text-accent hover:bg-accent-soft ${compact ? 'justify-center px-0' : ''}`}>
          <LogOut className="h-[18px] w-[18px]" aria-hidden /><span className={compact ? 'sr-only' : ''}>Déconnexion</span>
        </button>
        {!compact && <div className="px-3 pt-2 text-[12px] text-ink-soft truncate" title={user.email}>{user.displayName} · {user.role === 'admin' ? 'Administrateur' : user.role === 'editor' ? 'Éditeur' : 'Lecteur'}</div>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] btn-primary">Aller au contenu</a>
      {/* Barre mobile */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 bg-panel/95 backdrop-blur border-b border-line">
        <button className="btn-ghost !px-2" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu" aria-expanded={mobileOpen}><Menu className="h-5 w-5" /></button>
        <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
        <span className="font-display font-semibold">Newsletter Studio</span>
      </header>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="slide-in absolute inset-y-0 left-0 w-[min(85vw,var(--sidebar-width))] bg-panel shadow-pop" aria-label="Menu">
            <button className="absolute top-3 right-3 btn-ghost !px-2" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu"><X className="h-5 w-5" /></button>
            {sidebar(false)}
          </aside>
        </div>
      )}
      {/* Menu fixe (ordinateur) / rétractable (tablette) */}
      <aside className={`hidden lg:block fixed inset-y-0 left-0 z-20 bg-panel border-r border-line transition-[width] duration-200 ${collapsed ? 'w-[76px]' : 'w-sidebar'}`} aria-label="Menu">
        {sidebar(collapsed)}
        <button onClick={() => setCollapsed(!collapsed)} className="absolute -right-3 top-20 h-6 w-6 rounded-full bg-panel border border-line shadow-card flex items-center justify-center text-ink-soft hover:text-ink" aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}>
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </aside>
      <main id="contenu" className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-sidebar'}`}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8"><Outlet /></div>
      </main>
    </div>
  );
}
