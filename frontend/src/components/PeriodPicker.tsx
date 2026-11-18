import { useState } from 'react';

export type PeriodValue = { period: '7d' | '30d' | '90d' | '12m' | 'custom'; from?: string; to?: string };
export const periodQuery = (p: PeriodValue) => `period=${p.period}${p.period === 'custom' && p.from && p.to ? `&from=${p.from}&to=${p.to}` : ''}`;

export function PeriodPicker({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  const [from, setFrom] = useState(value.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(value.to ?? new Date().toISOString().slice(0, 10));
  const opts = [['7d', '7 jours'], ['30d', '30 jours'], ['90d', '90 jours'], ['12m', '12 mois'], ['custom', 'Personnalisée']] as const;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div role="radiogroup" aria-label="Période" className="inline-flex rounded border border-line bg-panel p-0.5">
        {opts.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={value.period === id} onClick={() => onChange(id === 'custom' ? { period: 'custom', from, to } : { period: id })}
            className={`px-3 py-1.5 text-[13px] rounded-[7px] transition-colors ${value.period === id ? 'bg-accent text-white' : 'text-ink-soft hover:text-ink'}`}>{label}</button>
        ))}
      </div>
      {value.period === 'custom' && (
        <div className="flex items-center gap-1 text-sm">
          <label className="sr-only" htmlFor="pfrom">Du</label><input id="pfrom" type="date" className="input !min-h-[34px] !w-auto" value={from} max={to} onChange={(e) => { setFrom(e.target.value); onChange({ period: 'custom', from: e.target.value, to }); }} />
          <span className="text-ink-soft">au</span>
          <label className="sr-only" htmlFor="pto">Au</label><input id="pto" type="date" className="input !min-h-[34px] !w-auto" value={to} min={from} onChange={(e) => { setTo(e.target.value); onChange({ period: 'custom', from, to: e.target.value }); }} />
        </div>
      )}
    </div>
  );
}
