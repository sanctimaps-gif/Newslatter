// E-mails transactionnels : confirmation (double opt-in), bienvenue, notification, réinitialisation.
import { createBlock, renderEmail, type Block, type EmailDesign } from '../../../shared/src/index.ts';
import { DEFAULT_SETTINGS as EMAIL_DEFAULTS } from '../../../shared/src/blocks.ts';
import { env } from '../../../backend/src/config/env.ts';
import { one, query } from '../../../backend/src/lib/db.ts';
import { sendMail } from '../../../backend/src/services/mailer.ts';
import { getSettings } from '../../../backend/src/services/settings.ts';
import { unsubscribeUrl } from '../../../backend/src/services/subscribers.ts';

function blk(type: Block['type'], props: Block['props']): Block { const b = createBlock(type); b.props = { ...b.props, ...props }; return b; }
const logo = () => blk('image', { imageUrl: 'https://sanctimaps.fr/icons/icon-192.png', imageAlt: 'SanctiMaps', imageWidth: 16, align: 'center', paddingTop: 28 });

async function transactional(to: string, subject: string, blocks: Block[], kind: string, subscriberId?: number) {
  const s = await getSettings();
  const design: EmailDesign = { settings: { ...EMAIL_DEFAULTS }, blocks: [logo(), ...blocks] };
  const r = renderEmail(design, { subject, firstName: null, unsubscribeUrl: subscriberId ? unsubscribeUrl(subscriberId) : `${env.PUBLIC_URL}/desinscription`, privacyUrl: `${env.PUBLIC_URL}/confidentialite`, legalText: s.organization.legalText });
  const out = await sendMail({ to, subject, html: r.html, text: r.text, fromName: s.sender.fromName, fromEmail: s.sender.fromEmail, replyTo: s.sender.replyTo || undefined, kind });
  if (out.status !== 'accepted') throw new Error(`Envoi ${kind} refusé : ${out.error}`);
  return out;
}

export async function sendConfirmationEmail(subscriberId: number, token: string) {
  const s = await one<{ email: string; first_name: string | null; status: string }>('SELECT email, first_name, status FROM subscribers WHERE id=$1', [subscriberId]);
  if (!s || s.status === 'confirmed' || s.status === 'suspended') return 'skipped';
  const url = `${env.PUBLIC_URL}/confirmation?t=${encodeURIComponent(token)}`;
  await transactional(s.email, 'Confirmez votre inscription à la lettre de SanctiMaps', [
    blk('heading', { text: 'Encore une étape', fontSize: 26 }),
    blk('text', { text: `Bonjour${s.first_name ? ' ' + s.first_name : ''},\n\nVous avez demandé à recevoir la lettre de SanctiMaps. Pour confirmer votre inscription, cliquez sur le bouton ci-dessous. Ce lien est valable 48 heures.`, align: 'center' }),
    blk('button', { label: 'Je confirme mon inscription', url }),
    blk('text', { text: `Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :\n${url}\n\nVous n'êtes pas à l'origine de cette demande ? Ignorez simplement ce message : vous ne recevrez rien.`, fontSize: 13, align: 'center', color: '#6b6155' }),
  ], 'confirmation', subscriberId);
  return 'sent';
}

export async function onConfirmed(subscriberId: number) {
  const s = await one<{ email: string; first_name: string | null; source: string }>('SELECT email, first_name, source FROM subscribers WHERE id=$1 AND status=\'confirmed\'', [subscriberId]);
  if (!s) return;
  const autos = new Map((await query<any>(`SELECT * FROM automations WHERE key IN ('welcome_email','admin_signup_notification') AND enabled`)).map((a) => [a.key, a]));
  const welcome = autos.get('welcome_email');
  if (welcome) {
    try {
      await transactional(s.email, String(welcome.config.subject || 'Bienvenue'), [
        blk('heading', { text: String(welcome.config.subject || 'Bienvenue') }),
        blk('text', { text: `Bonjour${s.first_name ? ' ' + s.first_name : ''},\n\n${welcome.config.body}` }),
        blk('button', { label: 'Explorer la carte des saints', url: 'https://sanctimaps.fr/' }),
      ], 'welcome', subscriberId);
      await query(`INSERT INTO automation_runs(automation_key, status, detail) VALUES ('welcome_email','ok',$1)`, [JSON.stringify({ subscriberId })]);
    } catch (e: any) {
      await query(`INSERT INTO automation_runs(automation_key, status, detail) VALUES ('welcome_email','error',$1)`, [JSON.stringify({ subscriberId, error: e.message })]);
    }
  }
  const notif = autos.get('admin_signup_notification');
  if (notif) {
    const to = String(notif.config.to || '') || (await one<{ email: string }>(`SELECT email FROM users WHERE role='admin' ORDER BY id LIMIT 1`))?.email;
    if (to) {
      try {
        await transactional(to, 'Nouvel abonné confirmé', [
          blk('heading', { text: 'Nouvel abonné', fontSize: 24 }),
          blk('text', { text: `**${s.email}** vient de confirmer son inscription (source : ${s.source}).\n\n[Voir dans le studio](${env.PUBLIC_URL}/admin/abonnes)` }),
        ], 'admin_notification');
        await query(`INSERT INTO automation_runs(automation_key, status, detail) VALUES ('admin_signup_notification','ok',$1)`, [JSON.stringify({ subscriberId })]);
      } catch (e: any) {
        await query(`INSERT INTO automation_runs(automation_key, status, detail) VALUES ('admin_signup_notification','error',$1)`, [JSON.stringify({ subscriberId, error: e.message })]);
      }
    }
  }
}

export async function sendPasswordReset(userId: number, url: string) {
  const u = await one<{ email: string }>('SELECT email FROM users WHERE id=$1', [userId]);
  if (!u) return;
  await transactional(u.email, 'Réinitialisation de votre mot de passe — Newsletter Studio', [
    blk('heading', { text: 'Réinitialiser le mot de passe', fontSize: 24 }),
    blk('text', { text: 'Une réinitialisation du mot de passe de votre compte SanctiMaps Newsletter Studio a été demandée. Le lien est valable 1 heure.', align: 'center' }),
    blk('button', { label: 'Choisir un nouveau mot de passe', url }),
    blk('text', { text: 'Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message.', fontSize: 13, align: 'center' }),
  ], 'password_reset');
}

export async function sendAdminReminder(to: string, subject: string, text: string, kind: string) {
  await transactional(to, subject, [blk('heading', { text: subject, fontSize: 24 }), blk('text', { text })], kind);
}
