import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Mise en page des pages publiques, dans l'esprit de sanctimaps.fr (papier, serif, carte). */
export default function PublicLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.35]" style={{ background: 'radial-gradient(1200px 500px at 50% -10%, rgb(var(--sea)) 0%, transparent 70%)' }} />
      <header className="relative px-4 pt-10 pb-2 flex justify-center">
        <a href="https://sanctimaps.fr/" className="flex flex-col items-center gap-3 no-underline text-ink text-center">
          <img src={`${import.meta.env.BASE_URL}logo-512.png`} alt="SanctiMaps — la carte mondiale des saints" className="h-32 w-32 sm:h-36 sm:w-36 rounded-[28px] shadow-pop" />
          <span className="leading-tight"><span className="block font-display font-semibold text-2xl">SanctiMaps</span><span className="block text-[12px] tracking-[0.14em] uppercase text-ink-soft mt-0.5">La carte mondiale des saints</span></span>
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
