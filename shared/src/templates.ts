// Modèles de départ (enregistrés en base par le script de seed, ensuite modifiables).
import { BRAND, DEFAULT_SETTINGS, createBlock, type Block, type BlockProps, type BlockType, type EmailDesign } from './blocks.ts';

const LOGO = 'https://sanctimaps.fr/icons/icon-192.png';

function b(type: BlockType, props: BlockProps = {}): Block {
  const blk = createBlock(type);
  blk.props = { ...blk.props, ...props };
  return blk;
}

const logo = () => b('image', { imageUrl: LOGO, imageAlt: 'SanctiMaps', imageWidth: 18, align: 'center', url: 'https://sanctimaps.fr/', paddingTop: 28, paddingBottom: 4 });
const footer = () => b('footer', { text: 'Vous recevez la lettre de SanctiMaps car vous vous y êtes inscrit(e) sur sanctimaps.fr.' });

export interface StarterTemplate { name: string; description: string; category: string; design: EmailDesign }

export function starterTemplates(): StarterTemplate[] {
  return [
    {
      name: 'Newsletter classique', category: 'classique',
      description: 'Logo, titre, texte d\'introduction, bouton et pied de page.',
      design: { settings: { ...DEFAULT_SETTINGS }, blocks: [
        logo(),
        b('heading', { text: 'La lettre de SanctiMaps' }),
        b('text', { text: 'Bonjour {{prenom}},\n\nVoici les nouveautés de la carte mondiale des saints.', align: 'left' }),
        b('divider'),
        b('subheading', { text: 'À la une' }),
        b('text', { text: 'Présentez ici le sujet principal de la lettre.' }),
        b('button', { label: 'Ouvrir la carte', url: 'https://sanctimaps.fr/' }),
        footer(),
      ] },
    },
    {
      name: 'Newsletter éditoriale', category: 'editoriale',
      description: 'Long texte de réflexion avec citation, idéale pour le saint du jour.',
      design: { settings: { ...DEFAULT_SETTINGS }, blocks: [
        logo(),
        b('subheading', { text: 'Le saint du jour', align: 'center', color: BRAND.gold, fontSize: 15 }),
        b('heading', { text: 'Saint Vincent de Paul, l\'apôtre de la charité', fontSize: 28 }),
        b('divider', { lineColor: BRAND.goldLight }),
        b('text', { text: 'Bonjour {{prenom}},\n\nAujourd\'hui nous fêtons **saint Vincent de Paul**. Racontez ici son histoire, les lieux de sa vie et ce qu\'il peut nous dire aujourd\'hui.' }),
        b('quote', { text: 'La charité est inventive jusqu\'à l\'infini.', author: 'Saint Vincent de Paul' }),
        b('text', { text: 'Poursuivez votre texte ici.' }),
        b('link', { label: 'Voir sa fiche sur SanctiMaps →', url: 'https://sanctimaps.fr/saints/' }),
        footer(),
      ] },
    },
    {
      name: 'Newsletter avec image principale', category: 'image',
      description: 'Grande image en tête, titre, texte et bouton.',
      design: { settings: { ...DEFAULT_SETTINGS }, blocks: [
        b('image', { imageUrl: '', imageAlt: 'Image principale', imageWidth: 100, paddingTop: 0, paddingBottom: 0 }),
        b('heading', { text: 'Un titre fort pour votre image', paddingTop: 28 }),
        b('text', { text: 'Bonjour {{prenom}},\n\nUn texte court qui accompagne l\'image principale.', align: 'center' }),
        b('button', { label: 'En savoir plus', url: 'https://sanctimaps.fr/' }),
        footer(),
      ] },
    },
    {
      name: 'Newsletter avec plusieurs actualités', category: 'actualites',
      description: 'Une actualité principale puis plusieurs brèves en colonnes.',
      design: { settings: { ...DEFAULT_SETTINGS }, blocks: [
        logo(),
        b('heading', { text: 'Les actualités du mois' }),
        b('text', { text: 'Bonjour {{prenom}}, voici ce qui a changé sur SanctiMaps.', align: 'center' }),
        b('imageText', { text: '**Nouveaux lieux sur la carte**\nDécrivez la première actualité en quelques lignes. [Lire la suite](https://sanctimaps.fr/lieux/)' }),
        b('divider'),
        b('columns2', { columns: [
          { title: 'Calendrier', text: 'Les fêtes du mois à venir.', buttonLabel: 'Voir', buttonUrl: 'https://sanctimaps.fr/calendrier/' },
          { title: 'Époques', text: 'Parcourir les saints par siècle.', buttonLabel: 'Voir', buttonUrl: 'https://sanctimaps.fr/epoques/' },
        ] }),
        b('columns3', { columns: [
          { title: 'Pays', text: 'Les saints de chaque pays.' },
          { title: 'Lieux', text: 'Sanctuaires et pèlerinages.' },
          { title: 'Saints', text: 'L\'index complet.' },
        ] }),
        footer(),
      ] },
    },
    {
      name: 'Newsletter promotionnelle', category: 'promotion',
      description: 'Annonce d\'un événement ou d\'une nouveauté, avec liste d\'arguments et appel à l\'action.',
      design: { settings: { ...DEFAULT_SETTINGS, contentBackground: '#ffffff' }, blocks: [
        logo(),
        b('subheading', { text: 'Nouveau', align: 'center', color: BRAND.accent, fontSize: 14 }),
        b('heading', { text: 'Annoncez votre nouveauté' }),
        b('text', { text: 'Bonjour {{prenom}},\n\nPrésentez en une phrase ce que vous proposez.', align: 'center' }),
        b('list', { items: ['Premier avantage', 'Deuxième avantage', 'Troisième avantage'] }),
        b('button', { label: 'Je découvre', url: 'https://sanctimaps.fr/', buttonColor: BRAND.accent }),
        b('spacer', { height: 12 }),
        footer(),
      ] },
    },
    {
      name: 'Newsletter minimaliste', category: 'minimaliste',
      description: 'Uniquement du texte, sobre et personnel.',
      design: { settings: { ...DEFAULT_SETTINGS, backgroundColor: '#ffffff', contentBackground: '#ffffff' }, blocks: [
        b('text', { text: 'Bonjour {{prenom}},\n\nÉcrivez votre message ici, comme une lettre personnelle.\n\nBien fidèlement,\nL\'équipe SanctiMaps', paddingTop: 32 }),
        footer(),
      ] },
    },
  ];
}
