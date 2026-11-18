import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Columns2, Columns3, Copy, Eye, GripVertical, Heading1, Heading2, Image as ImageIcon, ImagePlus,
  Link2, List, Minus, Monitor, MousePointerSquareDashed, MoveVertical, PanelBottom, PenLine, Plus, Quote, Settings2, Smartphone, Trash2, Type,
} from 'lucide-react';
import { BLOCK_LABELS, BLOCK_TYPES, createBlock, renderBlockHtml, renderEmail, type Block, type BlockProps, type BlockType, type ColumnItem, type EmailDesign, type EmailSettings } from '@shared/index';
import { MediaLibrary } from './MediaLibrary';

const ICONS: Record<BlockType, typeof Type> = {
  heading: Heading1, subheading: Heading2, text: Type, image: ImageIcon, imageText: ImagePlus, button: MousePointerSquareDashed, link: Link2,
  divider: Minus, spacer: MoveVertical, columns2: Columns2, columns3: Columns3, list: List, quote: Quote, footer: PanelBottom,
};
const TEXT_TYPES: BlockType[] = ['heading', 'subheading', 'text', 'quote', 'footer', 'imageText'];
type View = 'edit' | 'desktop' | 'mobile' | 'final';

const ctxFor = (sample: boolean) => ({ subject: 'Aperçu', firstName: null, sampleData: sample, unsubscribeUrl: '#desinscription', privacyUrl: '#confidentialite', legalText: 'SanctiMaps — la carte mondiale des saints · sanctimaps.fr' });

export function EmailEditor({ design, onChange, subject, preheader }: { design: EmailDesign; onChange: (d: EmailDesign) => void; subject?: string; preheader?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>('edit');
  const [sample, setSample] = useState(true);
  const [panel, setPanel] = useState<'blocks' | 'props'>('blocks');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const blocks = design.blocks;
  const sel = blocks.find((b) => b.id === selected) ?? null;

  const setBlocks = (b: Block[]) => onChange({ ...design, blocks: b });
  const update = (id: string, props: Partial<BlockProps>) => setBlocks(blocks.map((b) => (b.id === id ? { ...b, props: { ...b.props, ...props } } : b)));
  const add = (type: BlockType) => {
    const b = createBlock(type);
    const footerIdx = blocks.findIndex((x) => x.type === 'footer');
    const at = selected ? blocks.findIndex((x) => x.id === selected) + 1 : footerIdx >= 0 && type !== 'footer' ? footerIdx : blocks.length;
    const next = [...blocks]; next.splice(at, 0, b); setBlocks(next); setSelected(b.id); setPanel('props');
  };
  const move = (id: string, dir: -1 | 1) => { const i = blocks.findIndex((b) => b.id === id); const j = i + dir; if (j < 0 || j >= blocks.length) return; setBlocks(arrayMove(blocks, i, j)); };
  const remove = (id: string) => { setBlocks(blocks.filter((b) => b.id !== id)); if (selected === id) setSelected(null); };
  const duplicate = (id: string) => { const i = blocks.findIndex((b) => b.id === id); const copy = { ...structuredClone(blocks[i]), id: createBlock(blocks[i].type).id }; const next = [...blocks]; next.splice(i + 1, 0, copy); setBlocks(next); setSelected(copy.id); };
  const onDragEnd = (e: DragEndEvent) => { if (!e.over || e.active.id === e.over.id) return; setBlocks(arrayMove(blocks, blocks.findIndex((b) => b.id === e.active.id), blocks.findIndex((b) => b.id === e.over!.id))); };

  const rendered = useMemo(() => (view === 'edit' ? null : renderEmail(design, { ...ctxFor(view !== 'final' && sample), subject: subject || 'Aperçu', preheader })), [design, view, sample, subject, preheader]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[230px_minmax(0,1fr)_320px] gap-4 items-start">
      {/* Barre d'aperçu */}
      <div className="xl:col-span-3 flex items-center justify-between gap-3 flex-wrap card px-3 py-2">
        <div role="tablist" aria-label="Mode d'affichage" className="inline-flex rounded border border-line p-0.5 bg-paper">
          {([['edit', 'Édition', PenLine], ['desktop', 'Ordinateur', Monitor], ['mobile', 'Mobile', Smartphone], ['final', 'Rendu final', Eye]] as const).map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-[7px] ${view === id ? 'bg-panel shadow-card text-ink font-medium' : 'text-ink-soft hover:text-ink'}`}><Icon className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{label}</span></button>
          ))}
        </div>
        {(view === 'desktop' || view === 'mobile' || view === 'edit') && (
          <label className="flex items-center gap-2 text-[13px] text-ink-soft"><input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} className="h-4 w-4" />
            Données d'exemple <span className="rounded bg-gold-soft text-gold px-1.5 text-[11px] font-semibold">{'{{prenom}}'} = « Marie »</span></label>
        )}
        {view === 'final' && <span className="text-[13px] text-ink-soft">Exactement le HTML envoyé (sans données d'exemple), pied de page légal inclus.</span>}
      </div>

      {view !== 'edit' ? (
        <div className="xl:col-span-3 card p-4 bg-paper flex justify-center overflow-x-auto">
          <PreviewFrame html={rendered!.html} width={view === 'mobile' ? 375 : view === 'desktop' ? 760 : 820} mobile={view === 'mobile'} />
          {view === 'final' && <details className="ml-4 hidden lg:block w-80 shrink-0 text-sm"><summary className="cursor-pointer font-medium">Version texte brut</summary><pre className="whitespace-pre-wrap text-xs mt-2 p-3 bg-panel border border-line rounded max-h-[70vh] overflow-auto">{rendered!.text}</pre></details>}
        </div>
      ) : (
        <>
          {/* Palette (mobile : onglets) */}
          <div className="xl:hidden flex gap-2">
            <button className={`btn-sm flex-1 ${panel === 'blocks' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPanel('blocks')}><Plus className="h-4 w-4" />Ajouter un bloc</button>
            <button className={`btn-sm flex-1 ${panel === 'props' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPanel('props')}><Settings2 className="h-4 w-4" />Propriétés</button>
          </div>
          <aside className={`card p-3 xl:sticky xl:top-4 ${panel === 'blocks' ? '' : 'hidden xl:block'}`} aria-label="Blocs disponibles">
            <p className="text-[12px] uppercase tracking-wide text-ink-soft font-semibold px-1 mb-2">Ajouter un bloc</p>
            <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-2 gap-1.5">
              {BLOCK_TYPES.map((t) => { const I = ICONS[t]; return (
                <button key={t} onClick={() => add(t)} className="flex flex-col items-center gap-1 rounded border border-line bg-paper/60 px-1 py-2.5 text-[12px] text-ink hover:border-gold hover:bg-gold-soft transition-colors">
                  <I className="h-5 w-5 text-accent" aria-hidden />{BLOCK_LABELS[t]}
                </button>); })}
            </div>
            <p className="text-[12px] text-ink-soft mt-3 px-1">Le bloc est inséré sous le bloc sélectionné. Glissez-déposez ou utilisez ↑ ↓ pour réorganiser.</p>
          </aside>

          {/* Canevas */}
          <div className="card p-3 sm:p-6 min-w-0" style={{ background: design.settings.backgroundColor }} onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
            <div className="mx-auto rounded-[10px] border overflow-hidden" style={{ maxWidth: design.settings.width, background: design.settings.contentBackground, borderColor: 'rgb(222 211 192)' }}>
              {blocks.length === 0 && <p className="p-10 text-center text-sm" style={{ color: '#6b6155' }}>Ajoutez votre premier bloc depuis la palette.</p>}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  {blocks.map((b, i) => (
                    <CanvasBlock key={b.id} block={b} settings={design.settings} sample={sample} selected={selected === b.id} first={i === 0} last={i === blocks.length - 1}
                      onSelect={() => { setSelected(b.id); setPanel('props'); }} onMove={(d) => move(b.id, d)} onRemove={() => remove(b.id)} onDuplicate={() => duplicate(b.id)} onText={(text) => update(b.id, { text })} />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
            {!blocks.some((b) => b.type === 'footer') && <p className="text-center text-[12px] mt-3" style={{ color: '#6b6155' }}>Le pied de page légal avec le lien de désinscription sera ajouté automatiquement.</p>}
          </div>

          {/* Propriétés */}
          <aside className={`card p-4 xl:sticky xl:top-4 max-h-none xl:max-h-[calc(100vh-2rem)] overflow-y-auto ${panel === 'props' ? '' : 'hidden xl:block'}`} aria-label="Propriétés">
            {sel ? <BlockPanel block={sel} onChange={(p) => update(sel.id, p)} onClose={() => setSelected(null)} /> : <SettingsPanel settings={design.settings} onChange={(s) => onChange({ ...design, settings: { ...design.settings, ...s } })} />}
          </aside>
        </>
      )}
    </div>
  );
}

function PreviewFrame({ html, width, mobile }: { html: string; width: number; mobile?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(600);
  useEffect(() => {
    const f = ref.current; if (!f) return;
    const onLoad = () => { try { setH(Math.max(400, (f.contentDocument?.body.scrollHeight ?? 600) + 30)); } catch { /* */ } };
    f.addEventListener('load', onLoad); return () => f.removeEventListener('load', onLoad);
  }, [html]);
  return (
    <div className={mobile ? 'rounded-[36px] border-[10px] border-ink/85 shadow-pop overflow-hidden shrink-0' : 'shrink-0 shadow-card rounded overflow-hidden border border-line'} style={{ width: mobile ? width + 20 : '100%', maxWidth: width }}>
      <iframe ref={ref} title="Aperçu de l'e-mail" srcDoc={html} sandbox="allow-same-origin" style={{ width: '100%', height: mobile ? 720 : h, border: 0, display: 'block', background: '#fff' }} />
    </div>
  );
}

function CanvasBlock({ block, settings, sample, selected, first, last, onSelect, onMove, onRemove, onDuplicate, onText }: {
  block: Block; settings: EmailSettings; sample: boolean; selected: boolean; first: boolean; last: boolean;
  onSelect: () => void; onMove: (d: -1 | 1) => void; onRemove: () => void; onDuplicate: () => void; onText: (t: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const html = useMemo(() => renderBlockHtml(block, settings, ctxFor(sample)), [block, settings, sample]);
  const inline = selected && TEXT_TYPES.includes(block.type) && block.type !== 'footer';
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (ta.current) { ta.current.style.height = 'auto'; ta.current.style.height = `${ta.current.scrollHeight + 2}px`; } }, [block.props.text, inline]);
  const p = block.props;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={`group relative outline-offset-[-2px] ${selected ? 'outline outline-2 outline-[#b9863a]' : 'hover:outline hover:outline-1 hover:outline-[#d8b45c]'} ${isDragging ? 'opacity-80 shadow-pop' : ''}`}
      onClick={(e) => { e.preventDefault(); onSelect(); }}>
      <div className={`absolute right-1 top-1 z-10 flex gap-0.5 rounded-md bg-[#24201b]/90 p-0.5 text-white ${selected ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'}`} onClick={(e) => e.stopPropagation()}>
        <button {...attributes} {...listeners} className="p-1.5 cursor-grab active:cursor-grabbing rounded hover:bg-white/15" aria-label={`Déplacer le bloc ${BLOCK_LABELS[block.type]} (glisser ou flèches du clavier)`}><GripVertical className="h-3.5 w-3.5" /></button>
        <button className="p-1.5 rounded hover:bg-white/15 disabled:opacity-30" disabled={first} onClick={() => onMove(-1)} aria-label="Monter"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button className="p-1.5 rounded hover:bg-white/15 disabled:opacity-30" disabled={last} onClick={() => onMove(1)} aria-label="Descendre"><ArrowDown className="h-3.5 w-3.5" /></button>
        <button className="p-1.5 rounded hover:bg-white/15" onClick={onDuplicate} aria-label="Dupliquer"><Copy className="h-3.5 w-3.5" /></button>
        <button className="p-1.5 rounded hover:bg-red-500/70" onClick={onRemove} aria-label="Supprimer le bloc"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <span className={`absolute left-1 top-1 z-10 rounded bg-[#b9863a] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${selected ? '' : 'hidden'}`}>{BLOCK_LABELS[block.type]}</span>
      {inline ? (
        <div style={{ padding: `${p.paddingTop ?? 8}px 32px ${p.paddingBottom ?? 8}px`, background: p.backgroundColor }}>
          <label className="sr-only" htmlFor={`t-${block.id}`}>Texte du bloc</label>
          <textarea id={`t-${block.id}`} ref={ta} autoFocus value={p.text ?? ''} onChange={(e) => onText(e.target.value)} onClick={(e) => e.stopPropagation()}
            className="w-full resize-none border-0 bg-transparent p-0 focus:outline-none focus:ring-0"
            style={{ fontFamily: settings.fontFamily === 'serif' ? 'var(--font-serif)' : 'var(--font-ui)', fontSize: p.fontSize, textAlign: p.align ?? 'left', color: p.color ?? (block.type === 'subheading' ? settings.accentColor : settings.textColor), fontWeight: block.type === 'heading' || block.type === 'subheading' ? 700 : 400, lineHeight: 1.5, fontStyle: block.type === 'quote' ? 'italic' : 'normal' }} />
          <p className="text-[11px] mt-1" style={{ color: '#8a7f70', fontFamily: 'var(--font-ui)' }}>**gras** · *italique* · [texte](https://lien) · {'{{prenom}}'} · ligne vide = nouveau paragraphe</p>
        </div>
      ) : (
        // HTML produit par le moteur de rendu, qui échappe tout contenu saisi.
        <div dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}

// ─── Panneaux de propriétés ───
function Row({ label, children, id }: { label: string; children: ReactNode; id?: string }) {
  return <div><label className="label !text-[12px]" htmlFor={id}>{label}</label>{children}</div>;
}
function ColorInput({ label, value, onChange, fallback }: { label: string; value?: string; onChange: (v: string | undefined) => void; fallback: string }) {
  const id = `c-${label.replace(/\W/g, '')}`;
  return (
    <Row label={label} id={id}>
      <div className="flex gap-2 items-center">
        <input id={id} type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} className="h-9 w-11 rounded border border-line bg-panel cursor-pointer p-0.5" />
        <input className="input !min-h-[36px] font-mono text-xs" value={value ?? ''} placeholder={fallback} onChange={(e) => onChange(e.target.value || undefined)} aria-label={`${label} (hexadécimal)`} maxLength={9} />
      </div>
    </Row>
  );
}
function NumberInput({ label, value, onChange, min = 0, max = 100, step = 1, unit = 'px' }: { label: string; value?: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  const id = `n-${label.replace(/\W/g, '')}`;
  return (
    <Row label={`${label} (${value ?? 0} ${unit})`} id={id}>
      <input id={id} type="range" min={min} max={max} step={step} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
    </Row>
  );
}
function AlignInput({ value, onChange }: { value?: string; onChange: (v: 'left' | 'center' | 'right') => void }) {
  return (
    <Row label="Alignement">
      <div className="inline-flex rounded border border-line p-0.5" role="radiogroup" aria-label="Alignement">
        {([['left', AlignLeft, 'Gauche'], ['center', AlignCenter, 'Centre'], ['right', AlignRight, 'Droite']] as const).map(([v, I, l]) => (
          <button key={v} role="radio" aria-checked={(value ?? 'left') === v} aria-label={l} onClick={() => onChange(v)} className={`p-2 rounded-[7px] ${(value ?? 'left') === v ? 'bg-accent text-white' : 'text-ink-soft hover:text-ink'}`}><I className="h-4 w-4" /></button>
        ))}
      </div>
    </Row>
  );
}
function ImagePicker({ url, alt, onChange }: { url?: string; alt?: string; onChange: (p: { imageUrl?: string; imageAlt?: string }) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="rounded border border-line bg-sea/30 aspect-[16/9] flex items-center justify-center overflow-hidden">{url ? <img src={url} alt={alt} className="max-h-full max-w-full object-contain" /> : <ImageIcon className="h-8 w-8 text-ink-soft" aria-hidden />}</div>
      <div className="flex gap-2"><button className="btn-secondary btn-sm flex-1" onClick={() => setOpen(true)}>{url ? 'Remplacer l\'image' : 'Choisir une image'}</button>{url && <button className="btn-ghost btn-sm" onClick={() => onChange({ imageUrl: '' })}>Retirer</button>}</div>
      <Row label="Adresse de l'image (HTTPS)" id="img-url"><input id="img-url" className="input !min-h-[36px] text-xs" value={url ?? ''} onChange={(e) => onChange({ imageUrl: e.target.value })} placeholder="https://…" /></Row>
      <Row label="Texte alternatif" id="img-alt"><input id="img-alt" className="input !min-h-[36px]" value={alt ?? ''} onChange={(e) => onChange({ imageAlt: e.target.value })} placeholder="Description de l'image" /></Row>
      <MediaLibrary open={open} onClose={() => setOpen(false)} onSelect={(m) => { onChange({ imageUrl: m.url, imageAlt: alt || m.alt_text }); setOpen(false); }} />
    </div>
  );
}

function BlockPanel({ block, onChange, onClose }: { block: Block; onChange: (p: Partial<BlockProps>) => void; onClose: () => void }) {
  const p = block.props; const t = block.type;
  const hasText = ['heading', 'subheading', 'text', 'quote', 'footer', 'imageText'].includes(t);
  const hasAlign = ['heading', 'subheading', 'text', 'image', 'button', 'link', 'quote', 'footer'].includes(t);
  const hasFont = !['divider', 'spacer', 'image'].includes(t);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h3 className="font-semibold">{BLOCK_LABELS[t]}</h3><button className="text-[13px] text-ink-soft hover:text-ink" onClick={onClose}>Réglages généraux</button></div>
      {hasText && <Row label="Texte" id="p-text"><textarea id="p-text" className="input text-sm" rows={t === 'text' || t === 'imageText' ? 6 : 3} value={p.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} /></Row>}
      {t === 'quote' && <Row label="Auteur" id="p-author"><input id="p-author" className="input" value={p.author ?? ''} onChange={(e) => onChange({ author: e.target.value })} /></Row>}
      {(t === 'button' || t === 'link') && <>
        <Row label="Libellé" id="p-label"><input id="p-label" className="input" value={p.label ?? ''} onChange={(e) => onChange({ label: e.target.value })} /></Row>
        <Row label="Lien (https:// ou mailto:)" id="p-url"><input id="p-url" className="input" value={p.url ?? ''} onChange={(e) => onChange({ url: e.target.value })} /></Row>
      </>}
      {(t === 'image' || t === 'imageText') && <>
        <ImagePicker url={p.imageUrl} alt={p.imageAlt} onChange={onChange} />
        <Row label="Lien au clic (facultatif)" id="p-imgurl"><input id="p-imgurl" className="input" value={p.url ?? ''} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://sanctimaps.fr/…" /></Row>
      </>}
      {t === 'image' && <NumberInput label="Largeur" unit="%" min={10} max={100} value={p.imageWidth} onChange={(v) => onChange({ imageWidth: v })} />}
      {t === 'imageText' && <Row label="Position de l'image"><select className="input" value={p.imagePosition ?? 'left'} onChange={(e) => onChange({ imagePosition: e.target.value as any })}><option value="left">À gauche</option><option value="right">À droite</option></select></Row>}
      {t === 'list' && <Row label="Éléments (un par ligne)" id="p-items"><textarea id="p-items" className="input text-sm" rows={5} value={(p.items ?? []).join('\n')} onChange={(e) => onChange({ items: e.target.value.split('\n') })} /></Row>}
      {(t === 'columns2' || t === 'columns3') && <ColumnsEditor cols={p.columns ?? []} n={t === 'columns2' ? 2 : 3} onChange={(columns) => onChange({ columns })} />}
      {t === 'divider' && <ColorInput label="Couleur du trait" value={p.lineColor} onChange={(v) => onChange({ lineColor: v })} fallback="#ded3c0" />}
      {t === 'spacer' && <NumberInput label="Hauteur" min={4} max={120} value={p.height} onChange={(v) => onChange({ height: v })} />}
      {t === 'button' && <div className="grid grid-cols-2 gap-3">
        <ColorInput label="Fond du bouton" value={p.buttonColor} onChange={(v) => onChange({ buttonColor: v })} fallback="#8c2230" />
        <ColorInput label="Texte du bouton" value={p.buttonTextColor} onChange={(v) => onChange({ buttonTextColor: v })} fallback="#ffffff" />
        <div className="col-span-2"><NumberInput label="Arrondi" min={0} max={30} value={p.buttonRadius} onChange={(v) => onChange({ buttonRadius: v })} /></div>
      </div>}
      {hasAlign && <AlignInput value={p.align} onChange={(v) => onChange({ align: v })} />}
      {hasFont && <NumberInput label="Taille du texte" min={10} max={t === 'heading' ? 48 : 32} value={p.fontSize} onChange={(v) => onChange({ fontSize: v })} />}
      {!['divider', 'spacer', 'image', 'button'].includes(t) && <ColorInput label="Couleur du texte" value={p.color} onChange={(v) => onChange({ color: v })} fallback="#24201b" />}
      <ColorInput label="Arrière-plan du bloc" value={p.backgroundColor} onChange={(v) => onChange({ backgroundColor: v })} fallback="#fffdf8" />
      {t !== 'spacer' && <div className="grid grid-cols-2 gap-3">
        <NumberInput label="Espace au-dessus" max={80} value={p.paddingTop} onChange={(v) => onChange({ paddingTop: v })} />
        <NumberInput label="Espace au-dessous" max={80} value={p.paddingBottom} onChange={(v) => onChange({ paddingBottom: v })} />
      </div>}
      {t === 'footer' && <p className="hint">Le texte légal et les liens « Se désinscrire » et « Confidentialité » sont ajoutés automatiquement sous ce texte.</p>}
    </div>
  );
}

function ColumnsEditor({ cols, n, onChange }: { cols: ColumnItem[]; n: number; onChange: (c: ColumnItem[]) => void }) {
  const list = Array.from({ length: n }, (_, i) => cols[i] ?? {});
  const set = (i: number, c: Partial<ColumnItem>) => onChange(list.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <div className="space-y-3">
      {list.map((c, i) => (
        <details key={i} className="rounded border border-line p-2" open={i === 0}>
          <summary className="cursor-pointer text-sm font-medium">Colonne {i + 1}</summary>
          <div className="space-y-2 mt-2">
            <ImagePicker url={c.imageUrl} alt={c.imageAlt} onChange={(p) => set(i, p)} />
            <Row label="Titre"><input className="input" value={c.title ?? ''} onChange={(e) => set(i, { title: e.target.value })} /></Row>
            <Row label="Texte"><textarea className="input text-sm" rows={3} value={c.text ?? ''} onChange={(e) => set(i, { text: e.target.value })} /></Row>
            <Row label="Bouton : libellé"><input className="input" value={c.buttonLabel ?? ''} onChange={(e) => set(i, { buttonLabel: e.target.value })} /></Row>
            <Row label="Bouton : lien"><input className="input" value={c.buttonUrl ?? ''} onChange={(e) => set(i, { buttonUrl: e.target.value })} placeholder="https://…" /></Row>
          </div>
        </details>
      ))}
    </div>
  );
}

function SettingsPanel({ settings, onChange }: { settings: EmailSettings; onChange: (s: Partial<EmailSettings>) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Réglages généraux</h3>
      <p className="text-[13px] text-ink-soft">Cliquez sur un bloc pour modifier son contenu.</p>
      <Row label="Texte d'aperçu (pré-en-tête)" id="s-pre"><input id="s-pre" className="input" value={settings.preheader ?? ''} onChange={(e) => onChange({ preheader: e.target.value })} maxLength={150} placeholder="Affiché après l'objet dans la boîte de réception" /></Row>
      <Row label="Police" id="s-font"><select id="s-font" className="input" value={settings.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value as any })}><option value="serif">Serif SanctiMaps (Palatino, Georgia)</option><option value="sans">Sans serif (Helvetica, Arial)</option></select></Row>
      <NumberInput label="Largeur du message" min={480} max={720} step={10} value={settings.width} onChange={(v) => onChange({ width: v })} />
      <ColorInput label="Fond extérieur" value={settings.backgroundColor} onChange={(v) => onChange({ backgroundColor: v ?? '#f7f2e8' })} fallback="#f7f2e8" />
      <ColorInput label="Fond du contenu" value={settings.contentBackground} onChange={(v) => onChange({ contentBackground: v ?? '#fffdf8' })} fallback="#fffdf8" />
      <ColorInput label="Couleur du texte" value={settings.textColor} onChange={(v) => onChange({ textColor: v ?? '#24201b' })} fallback="#24201b" />
      <ColorInput label="Couleur des liens" value={settings.linkColor} onChange={(v) => onChange({ linkColor: v ?? '#8c2230' })} fallback="#8c2230" />
      <ColorInput label="Couleur d'accent" value={settings.accentColor} onChange={(v) => onChange({ accentColor: v ?? '#8c2230' })} fallback="#8c2230" />
    </div>
  );
}
