// Génération d'e-mails compatibles avec les clients de messagerie :
// mise en page en tableaux, styles en ligne, polices de remplacement,
// version texte brut, pied de page légal et lien de désinscription obligatoires.
import { BRAND, DEFAULT_SETTINGS, type Block, type ColumnItem, type EmailDesign, type EmailSettings } from './blocks.ts';

export interface RenderContext {
  subject: string;
  preheader?: string;
  firstName?: string | null;
  unsubscribeUrl: string;
  privacyUrl: string;
  legalText: string;          // nom de l'éditeur + adresse/contact
  trackLink?: (url: string) => string;
  openPixelUrl?: string;
  sampleData?: boolean;       // aperçu avec données d'exemple
}

export interface RenderedEmail { html: string; text: string }

const FONT_STACKS = {
  serif: "'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,'Times New Roman',serif",
  sans: "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function safeColor(c: string | undefined, fallback: string): string {
  if (!c) return fallback;
  return /^#[0-9a-fA-F]{3,8}$/.test(c.trim()) ? c.trim() : fallback;
}

export function safeUrl(u: string | undefined): string {
  if (!u) return '';
  const t = u.trim();
  if (/^https?:\/\//i.test(t) || /^mailto:/i.test(t)) return t;
  return '';
}

function num(n: number | undefined, def: number, min = 0, max = 200): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : def;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Remplace les variables {{prenom}} / {{prenom|valeur par défaut}}. */
export function applyVariables(text: string, ctx: Pick<RenderContext, 'firstName' | 'sampleData'>): string {
  const first = ctx.sampleData ? 'Marie' : (ctx.firstName ?? '').trim();
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' });
  return text
    .replace(/\{\{\s*date\s*\}\}/gi, today)
    .replace(/\{\{\s*prenom\s*(?:\|\s*([^}]*))?\}\}/gi, (_m, fb: string | undefined) => first || (fb ?? '').trim())
    .replace(/ +([,.;!?])/g, (_m, p) => (p === ',' || p === '.' ? p : ` ${p}`));
}

/** Mise en forme légère : **gras**, *italique*, [texte](url). Échappement préalable (anti-XSS). */
export function inlineMarkup(raw: string, linkColor: string, track?: (u: string) => string): string {
  let s = escapeHtml(raw);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const decoded = url.replace(/&amp;/g, '&');
    const safe = safeUrl(decoded);
    if (!safe) return label;
    const href = track && !safe.startsWith('mailto:') ? track(safe) : safe;
    return `<a href="${escapeHtml(href)}" style="color:${linkColor};text-decoration:underline;" target="_blank">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return s;
}

function paragraphs(raw: string, style: string, linkColor: string, track?: (u: string) => string): string {
  return raw.split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 12px 0;${style}">${inlineMarkup(p, linkColor, track).replace(/\n/g, '<br>')}</p>`).join('');
}

export function stripMarkup(raw: string): string {
  return raw.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1');
}

function wrapRow(inner: string, b: Block, s: EmailSettings, extraTd = ''): string {
  const p = b.props;
  const bg = p.backgroundColor ? `background-color:${safeColor(p.backgroundColor, s.contentBackground)};` : '';
  return `<tr><td class="px" style="padding:${num(p.paddingTop, 8)}px 32px ${num(p.paddingBottom, 8)}px 32px;${bg}${extraTd}">${inner}</td></tr>`;
}

function buttonHtml(label: string, url: string, color: string, textColor: string, radius: number, fontSize: number, font: string, align: string, track?: (u: string) => string): string {
  const safe = safeUrl(url);
  const href = safe ? escapeHtml(track && !safe.startsWith('mailto:') ? track(safe) : safe) : '#';
  // Bouton « à l'épreuve des balles » : tableau + lien coloré, lisible même sans CSS avancé (Outlook).
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="${align}" style="margin:0 ${align === 'center' ? 'auto' : '0'};"><tr>
<td align="center" bgcolor="${color}" style="border-radius:${radius}px;background-color:${color};">
<a href="${href}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${font};font-size:${fontSize}px;font-weight:bold;line-height:1.2;color:${textColor};text-decoration:none;border-radius:${radius}px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

function imageHtml(url: string, alt: string, width: number, s: EmailSettings, link?: string, track?: (u: string) => string): string {
  const src = safeUrl(url);
  if (!src) {
    return `<div style="padding:28px;border:1px dashed ${BRAND.line};color:${BRAND.inkSoft};font-family:${FONT_STACKS.sans};font-size:13px;text-align:center;">Image à choisir</div>`;
  }
  // Texte alternatif stylé : affiché proprement quand les images sont bloquées.
  const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;font-family:${FONT_STACKS.sans};font-size:14px;color:${s.textColor};background-color:${BRAND.sea};">`;
  const l = safeUrl(link);
  if (!l) return img;
  return `<a href="${escapeHtml(track ? track(l) : l)}" target="_blank">${img}</a>`;
}

function columnCell(c: ColumnItem, widthPx: number, s: EmailSettings, font: string, fontSize: number, track?: (u: string) => string): string {
  const parts: string[] = [];
  if (c.imageUrl) parts.push(`<div style="margin-bottom:10px;">${imageHtml(c.imageUrl, c.imageAlt ?? '', widthPx, s, undefined, track)}</div>`);
  if (c.title) parts.push(`<p style="margin:0 0 6px 0;font-family:${font};font-size:${fontSize + 3}px;font-weight:bold;color:${s.textColor};">${inlineMarkup(c.title, s.linkColor, track)}</p>`);
  if (c.text) parts.push(paragraphs(c.text, `font-family:${font};font-size:${fontSize}px;line-height:1.55;color:${s.textColor};`, s.linkColor, track));
  if (c.buttonLabel && c.buttonUrl) parts.push(buttonHtml(c.buttonLabel, c.buttonUrl, s.accentColor, '#ffffff', 6, 14, font, 'left', track));
  return parts.join('');
}

function renderBlock(b: Block, s: EmailSettings, ctx: RenderContext): string {
  const p = b.props;
  const font = FONT_STACKS[s.fontFamily] ?? FONT_STACKS.serif;
  const color = safeColor(p.color, s.textColor);
  const align = p.align ?? 'left';
  const track = ctx.trackLink;
  const inner = s.width - 64;
  const vars = (t: string | undefined) => applyVariables(t ?? '', ctx);
  switch (b.type) {
    case 'header': {
      // Bandeau : logo + nom sur fond coloré, encadré clair à droite (titre + date)
      const bg = safeColor(p.backgroundColor, s.accentColor); const box = safeColor(p.boxColor, BRAND.accentSoft); const boxText = safeColor(p.color, s.accentColor);
      const logo = safeUrl(p.imageUrl);
      return `<tr><td style="padding:0;"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>
<td class="stack" width="62%" bgcolor="${bg}" valign="middle" style="background-color:${bg};padding:16px 20px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
${logo ? `<td valign="middle" style="padding-right:12px;"><img src="${escapeHtml(logo)}" alt="${escapeHtml(p.imageAlt ?? '')}" width="44" height="44" style="display:block;width:44px;height:44px;border:0;border-radius:8px;"></td>` : ''}
<td valign="middle" style="font-family:${font};font-size:22px;line-height:1.1;font-weight:bold;color:#ffffff;">${escapeHtml(vars(p.title))}</td></tr></table></td>
<td class="stack" bgcolor="${box}" valign="middle" style="background-color:${box};padding:14px 20px;text-align:right;">
<p style="margin:0;font-family:${FONT_STACKS.sans};font-size:15px;line-height:1.3;font-weight:bold;color:${boxText};">${escapeHtml(vars(p.label))}</p>
${p.subtitle ? `<p style="margin:3px 0 0 0;font-family:${FONT_STACKS.sans};font-size:14px;font-weight:bold;color:${boxText};">${escapeHtml(vars(p.subtitle))}</p>` : ''}
</td></tr></table></td></tr>`;
    }
    case 'section': {
      const bg = safeColor(p.backgroundColor, s.accentColor);
      return `<tr><td style="padding:${num(p.paddingTop, 18)}px 0 ${num(p.paddingBottom, 4)}px 0;"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>
<td bgcolor="${bg}" style="background-color:${bg};padding:7px 32px;font-family:${FONT_STACKS.sans};font-size:13px;line-height:1.4;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:${safeColor(p.color, '#ffffff')};">${escapeHtml(vars(p.text))}</td></tr></table></td></tr>`;
    }
    case 'article': {
      const u = safeUrl(p.url); const href = u ? escapeHtml(track && !u.startsWith('mailto:') ? track(u) : u) : '';
      const titleColor = safeColor(p.color, s.accentColor);
      const fs = num(p.fontSize, 15, 11, 22);
      const kicker = `<div style="width:24px;height:3px;line-height:3px;font-size:0;background-color:${BRAND.gold};margin:0 0 8px 0;">&nbsp;</div>`;
      const title = `<p style="margin:0 0 6px 0;font-family:${font};font-size:${fs + 3}px;line-height:1.3;font-weight:bold;color:${titleColor};">${href ? `<a href="${href}" target="_blank" style="color:${titleColor};text-decoration:none;">${escapeHtml(vars(p.title))}</a>` : escapeHtml(vars(p.title))}</p>`;
      const body = paragraphs(vars(p.text), `font-family:${font};font-size:${fs}px;line-height:1.55;color:${safeColor(s.textColor, BRAND.ink)};`, s.linkColor, track);
      const more = href && p.label ? `<p style="margin:0;font-family:${font};font-size:${fs - 1}px;"><a href="${href}" target="_blank" style="color:${s.linkColor};text-decoration:underline;">${escapeHtml(p.label)} →</a></p>` : '';
      const textCol = kicker + title + body + more;
      if (p.imagePosition === 'top') {
        return wrapRow(`<div style="margin:0 0 14px 0;">${imageHtml(p.imageUrl ?? '', p.imageAlt ?? '', inner, s, u, track)}</div>${textCol}`, b, s);
      }
      const imgW = Math.round(inner * 0.42); const txtW = inner - imgW - 20;
      // L'image est toujours en premier dans le code (donc au-dessus sur mobile) ;
      // pour l'afficher à droite sur ordinateur, la ligne est inversée avec dir="rtl" (technique e-mail standard).
      const rtl = p.imagePosition === 'right';
      const imgCell = `<td class="stack" dir="ltr" width="${imgW}" valign="top" style="width:${imgW}px;">${imageHtml(p.imageUrl ?? '', p.imageAlt ?? '', imgW, s, u, track)}</td>`;
      const gap = `<td class="stack-gap" width="20" style="width:20px;font-size:0;line-height:0;">&nbsp;</td>`;
      const txtCell = `<td class="stack" dir="ltr" width="${txtW}" valign="top" style="width:${txtW}px;text-align:left;">${textCol}</td>`;
      return wrapRow(`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"${rtl ? ' dir="rtl"' : ''}><tr>${imgCell + gap + txtCell}</tr></table>`, b, s);
    }
    case 'heading':
      return wrapRow(`<h1 style="margin:0;font-family:${font};font-size:${num(p.fontSize, 30, 12, 60)}px;line-height:1.2;font-weight:bold;color:${color};text-align:${align};">${inlineMarkup(vars(p.text), s.linkColor, track)}</h1>`, b, s);
    case 'subheading':
      return wrapRow(`<h2 style="margin:0;font-family:${font};font-size:${num(p.fontSize, 21, 12, 48)}px;line-height:1.3;font-weight:bold;color:${safeColor(p.color, s.accentColor)};text-align:${align};">${inlineMarkup(vars(p.text), s.linkColor, track)}</h2>`, b, s);
    case 'text':
      return wrapRow(paragraphs(vars(p.text), `font-family:${font};font-size:${num(p.fontSize, 16, 10, 32)}px;line-height:1.65;color:${color};text-align:${align};`, s.linkColor, track), b, s);
    case 'image': {
      const w = Math.round(inner * num(p.imageWidth, 100, 10, 100) / 100);
      return wrapRow(`<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="${align}" width="${w}" style="margin:0 ${align === 'center' ? 'auto' : '0'};width:${w}px;max-width:100%;"><tr><td>${imageHtml(p.imageUrl ?? '', p.imageAlt ?? '', w, s, p.url, track)}</td></tr></table>`, b, s);
    }
    case 'imageText': {
      const imgW = Math.round(inner * 0.4);
      const txtW = inner - imgW - 20;
      const imgCell = `<td class="stack" width="${imgW}" valign="top" style="width:${imgW}px;">${imageHtml(p.imageUrl ?? '', p.imageAlt ?? '', imgW, s, p.url, track)}</td>`;
      const gap = `<td class="stack-gap" width="20" style="width:20px;font-size:0;line-height:0;">&nbsp;</td>`;
      const txtCell = `<td class="stack" width="${txtW}" valign="top" style="width:${txtW}px;">${paragraphs(vars(p.text), `font-family:${font};font-size:${num(p.fontSize, 15, 10, 28)}px;line-height:1.6;color:${color};`, s.linkColor, track)}</td>`;
      const cells = p.imagePosition === 'right' ? txtCell + gap + imgCell : imgCell + gap + txtCell;
      return wrapRow(`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`, b, s);
    }
    case 'button':
      return wrapRow(buttonHtml(p.label ?? 'Bouton', p.url ?? '', safeColor(p.buttonColor, s.accentColor), safeColor(p.buttonTextColor, '#ffffff'), num(p.buttonRadius, 6, 0, 40), num(p.fontSize, 16, 10, 28), font, align, track), b, s, `text-align:${align};`);
    case 'link': {
      const u = safeUrl(p.url);
      const href = u ? escapeHtml(track && !u.startsWith('mailto:') ? track(u) : u) : '#';
      return wrapRow(`<p style="margin:0;font-family:${font};font-size:${num(p.fontSize, 15)}px;text-align:${align};"><a href="${href}" target="_blank" style="color:${safeColor(p.color, s.linkColor)};text-decoration:underline;">${escapeHtml(p.label ?? p.url ?? '')}</a></p>`, b, s);
    }
    case 'divider':
      return wrapRow(`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid ${safeColor(p.lineColor, BRAND.line)};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`, b, s);
    case 'spacer':
      return `<tr><td style="height:${num(p.height, 24, 4, 160)}px;font-size:0;line-height:0;${p.backgroundColor ? `background-color:${safeColor(p.backgroundColor, s.contentBackground)};` : ''}">&nbsp;</td></tr>`;
    case 'columns2':
    case 'columns3': {
      const n = b.type === 'columns2' ? 2 : 3;
      const cols = (p.columns ?? []).slice(0, n);
      while (cols.length < n) cols.push({});
      const gap = 20;
      const w = Math.floor((inner - gap * (n - 1)) / n);
      const cells = cols.map((c, i) => `${i ? `<td class="stack-gap" width="${gap}" style="width:${gap}px;font-size:0;line-height:0;">&nbsp;</td>` : ''}<td class="stack" width="${w}" valign="top" style="width:${w}px;">${columnCell({ ...c, title: vars(c.title), text: vars(c.text) }, w, s, font, num(p.fontSize, 15, 10, 24), track)}</td>`).join('');
      return wrapRow(`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`, b, s);
    }
    case 'list': {
      const items = (p.items ?? []).filter((x) => x.trim());
      const lis = items.map((it) => `<tr><td width="22" valign="top" style="width:22px;font-family:${font};font-size:${num(p.fontSize, 16)}px;line-height:1.6;color:${s.accentColor};">&#8226;</td><td valign="top" style="font-family:${font};font-size:${num(p.fontSize, 16)}px;line-height:1.6;color:${color};padding-bottom:4px;">${inlineMarkup(vars(it), s.linkColor, track)}</td></tr>`).join('');
      return wrapRow(`<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${lis}</table>`, b, s);
    }
    case 'quote':
      return wrapRow(`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${BRAND.gold};padding:4px 0 4px 18px;">
<p style="margin:0;font-family:${FONT_STACKS.serif};font-size:${num(p.fontSize, 18)}px;line-height:1.55;font-style:italic;color:${color};text-align:${align};">« ${inlineMarkup(vars(p.text), s.linkColor, track)} »</p>
${p.author ? `<p style="margin:8px 0 0 0;font-family:${font};font-size:14px;color:${BRAND.inkSoft};text-align:${align};">— ${escapeHtml(p.author)}</p>` : ''}</td></tr></table>`, b, s);
    case 'footer':
      return footerRow(b, s, ctx);
  }
}

function footerRow(b: Block | null, s: EmailSettings, ctx: RenderContext): string {
  const p = b?.props ?? {};
  const color = safeColor(p.color, BRAND.inkSoft);
  const fs = num(p.fontSize, 12, 10, 16);
  const sans = FONT_STACKS.sans;
  const custom = p.text ? paragraphs(applyVariables(p.text, ctx), `font-family:${sans};font-size:${fs}px;line-height:1.5;color:${color};text-align:center;`, color) : '';
  return `<tr><td class="px" style="padding:${num(p.paddingTop, 24)}px 32px ${num(p.paddingBottom, 24)}px 32px;border-top:1px solid ${BRAND.line};${p.backgroundColor ? `background-color:${safeColor(p.backgroundColor, s.contentBackground)};` : ''}">
${custom}
<p style="margin:0 0 8px 0;font-family:${sans};font-size:${fs}px;line-height:1.5;color:${color};text-align:center;">${escapeHtml(ctx.legalText)}</p>
<p style="margin:0;font-family:${sans};font-size:${fs}px;line-height:1.5;color:${color};text-align:center;">
<a href="${escapeHtml(ctx.unsubscribeUrl)}" target="_blank" style="color:${color};text-decoration:underline;">Se désinscrire</a> &nbsp;·&nbsp;
<a href="${escapeHtml(ctx.privacyUrl)}" target="_blank" style="color:${color};text-decoration:underline;">Confidentialité</a></p>
</td></tr>`;
}

function blockText(b: Block, ctx: RenderContext): string {
  const p = b.props;
  const v = (t?: string) => stripMarkup(applyVariables(t ?? '', ctx));
  switch (b.type) {
    case 'header': return [v(p.title), v(p.label), v(p.subtitle)].filter(Boolean).join(' — ');
    case 'section': return `== ${v(p.text).toUpperCase()} ==`;
    case 'article': return [v(p.title).toUpperCase(), v(p.text), safeUrl(p.url) ? `${p.label || 'Lire'} : ${safeUrl(p.url)}` : ''].filter(Boolean).join('\n');
    case 'heading': return v(p.text).toUpperCase();
    case 'subheading': return v(p.text);
    case 'text': case 'imageText': return v(p.text);
    case 'image': return p.imageAlt ? `[Image : ${p.imageAlt}]` : '';
    case 'button': case 'link': return `${p.label ?? ''} : ${safeUrl(p.url)}`;
    case 'divider': return '----------';
    case 'spacer': return '';
    case 'columns2': case 'columns3':
      return (p.columns ?? []).map((c) => [v(c.title), v(c.text), c.buttonUrl ? `${c.buttonLabel} : ${safeUrl(c.buttonUrl)}` : ''].filter(Boolean).join('\n')).join('\n\n');
    case 'list': return (p.items ?? []).map((i) => `• ${v(i)}`).join('\n');
    case 'quote': return `« ${v(p.text)} »${p.author ? `\n— ${p.author}` : ''}`;
    case 'footer': return v(p.text);
  }
}

export function renderEmail(design: EmailDesign, ctx: RenderContext): RenderedEmail {
  const s: EmailSettings = { ...DEFAULT_SETTINGS, ...(design.settings ?? {}) };
  s.backgroundColor = safeColor(s.backgroundColor, DEFAULT_SETTINGS.backgroundColor);
  s.contentBackground = safeColor(s.contentBackground, DEFAULT_SETTINGS.contentBackground);
  s.textColor = safeColor(s.textColor, DEFAULT_SETTINGS.textColor);
  s.linkColor = safeColor(s.linkColor, DEFAULT_SETTINGS.linkColor);
  s.accentColor = safeColor(s.accentColor, DEFAULT_SETTINGS.accentColor);
  s.width = num(s.width, 600, 480, 720);
  const blocks = design.blocks ?? [];
  const footer = blocks.find((b) => b.type === 'footer') ?? null;
  const body = blocks.filter((b) => b.type !== 'footer').map((b) => renderBlock(b, s, ctx)).join('\n');
  // Le pied de page légal est toujours présent, même si le bloc a été supprimé.
  const foot = footerRow(footer, s, ctx);
  const preheader = escapeHtml(ctx.preheader ?? s.preheader ?? '');
  const pixel = ctx.openPixelUrl ? `<img src="${escapeHtml(ctx.openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">` : '';
  const html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(ctx.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{-ms-interpolation-mode:bicubic;}
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
  @media screen and (max-width:${s.width + 20}px){
    .container{width:100%!important;}
    .px{padding-left:20px!important;padding-right:20px!important;}
    .stack{display:block!important;width:100%!important;padding-bottom:16px!important;}
    .stack-gap{display:none!important;}
    .stack img{max-width:100%!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${s.backgroundColor};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>` : ''}
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${s.backgroundColor}" style="background-color:${s.backgroundColor};">
<tr><td align="center" style="padding:24px 8px;">
<!--[if mso]><table role="presentation" width="${s.width}" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="container" width="${s.width}" border="0" cellpadding="0" cellspacing="0" style="width:${s.width}px;max-width:100%;background-color:${s.contentBackground};border:1px solid ${BRAND.line};border-radius:10px;">
${body}
${foot}
</table>
<!--[if mso]></td></tr></table><![endif]-->
${pixel}
</td></tr></table>
</body>
</html>`;

  const textParts = blocks.filter((b) => b.type !== 'footer').map((b) => blockText(b, ctx)).filter((t) => t.trim());
  const footText = footer ? blockText(footer, ctx) : '';
  const text = `${textParts.join('\n\n')}\n\n--\n${footText ? `${footText}\n` : ''}${ctx.legalText}\nSe désinscrire : ${ctx.unsubscribeUrl}\nConfidentialité : ${ctx.privacyUrl}\n`;
  return { html, text };
}

/** HTML e-mail d'un seul bloc (canevas de l'éditeur : rendu identique à l'envoi). */
export function renderBlockHtml(block: Block, settings: EmailSettings, ctx: RenderContext): string {
  const s: EmailSettings = { ...DEFAULT_SETTINGS, ...settings };
  const row = block.type === 'footer' ? footerRow(block, s, ctx) : renderBlock(block, s, { ...ctx, trackLink: undefined });
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${safeColor(s.contentBackground, DEFAULT_SETTINGS.contentBackground)};">${row}</table>`;
}

/** Liste des URL http(s) d'un design (pour le suivi des clics). */
export function collectLinks(design: EmailDesign): string[] {
  const urls = new Set<string>();
  const scan = (t?: string) => { if (!t) return; for (const m of t.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) { const u = safeUrl(m[1]); if (u && !u.startsWith('mailto:')) urls.add(u); } };
  for (const b of design.blocks ?? []) {
    const p = b.props;
    scan(p.text); (p.items ?? []).forEach(scan);
    for (const u of [p.url]) { const s = safeUrl(u); if (s && !s.startsWith('mailto:')) urls.add(s); }
    for (const c of p.columns ?? []) { scan(c.text); scan(c.title); const s = safeUrl(c.buttonUrl); if (s && !s.startsWith('mailto:')) urls.add(s); }
  }
  return [...urls];
}
