import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Mise en page des pages publiques, dans l'esprit de sanctimaps.fr (papier, serif, carte). */
export default function PublicLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.35]" style={{ background: 'radial-gradient(1200px 500px at 50% -10%, rgb(var(--sea)) 0%, transparent 70%)' }} />
      <header className="relative px-4 pt-8 pb-2 flex justify-center">
        <a href="https://sanctimaps.fr/" className="flex items-center gap-3 no-underline text-ink">
          <img src="/logo.png" alt="" className="h-12 w-12 rounded-[12px] shadow-card" />
          <span className="leading-tight"><span className="block font-display font-semibold text-xl">SanctiMaps</span><span className="block text-[12px] tracking-[0.12em] uppercase text-ink-soft">La carte mondiale des saints</span></span>
        </a>
      </header>
      <main className={`relative flex-1 w-full mx-auto px-4 py-8 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>{children}</main>
      <footer className="relative text-center text-[13px] text-ink-soft py-6 px-4 space-x-3">
        <a href="https://sanctimaps.fr/" className="text-ink-soft">sanctimaps.fr</a><span aria-hidden>·</span>
        <Link to="/inscription" className="text-ink-soft">S'inscrire</Link><span aria-hidden>·</span>
        <Link to="/confidentialite" className="text-ink-soft">Confidentialité</Link>
      </footer>
    </div>
  );
}
