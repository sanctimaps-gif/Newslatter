// E-mails transactionnels (confirmation, bienvenue, notifications) rendus avec le même moteur que les campagnes.
import { DEFAULT_SETTINGS as EMAIL_DEFAULTS, createBlock, renderEmail, type Block } from '../../shared/src/index';
import type { Db } from './db';
import { sendMail } from './mail';
import { getSettings, siteUrl } from './settings';

type Spec = [Block['type'], Block['props']];

export function transactional(db: Db, to: string, subject: string, specs: Spec[], kind: string, subscriberId?: number) {
  const s = getSettings();
  const logo = createBlock('image');
  logo.props = { ...logo.props, imageUrl: 'https://sanctimaps.fr/icons/icon-512.png', imageAlt: 'SanctiMaps', imageWidth: 24, align: 'center', paddingTop: 28 };
  const blocks = [logo, ...specs.map(([type, props]) => { const b = createBlock(type); b.props = { ...b.props, ...props }; return b; })];
  // Les liens de désinscription sont construits par le routeur ; ici un lien générique suffit (message transactionnel).
  const unsub = subscriberId ? `${siteUrl()}#/desinscription` : `${siteUrl()}#/desinscription`;
  const r = renderEmail({ settings: { ...EMAIL_DEFAULTS }, blocks }, { subject, firstName: null, unsubscribeUrl: unsub, privacyUrl: `${siteUrl()}#/confidentialite`, legalText: s.organization.legalText });
  return sendMail(db, { to, subject, html: r.html, text: r.text, fromName: s.sender.fromName, fromEmail: s.sender.fromEmail, replyTo: s.sender.replyTo || undefined, kind });
}
