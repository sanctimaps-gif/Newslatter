// Définition des blocs de l'éditeur visuel — partagée entre le frontend (aperçu)
// et le backend/worker (génération de l'e-mail envoyé).

export type Align = 'left' | 'center' | 'right';

export interface BlockStyle {
  align?: Align;
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
  paddingTop?: number;
  paddingBottom?: number;
}

export interface ColumnItem {
  imageUrl?: string;
  imageAlt?: string;
  title?: string;
  text?: string;
  buttonLabel?: string;
  buttonUrl?: string;
}

export type BlockType =
  | 'heading' | 'subheading' | 'text' | 'image' | 'imageText' | 'button' | 'link'
  | 'divider' | 'spacer' | 'columns2' | 'columns3' | 'list' | 'quote' | 'footer';

export interface BlockProps extends BlockStyle {
  text?: string;
  url?: string;
  label?: string;
  imageUrl?: string;
  imageAlt?: string;
  imageWidth?: number; // en pourcentage de la largeur du contenu
  imagePosition?: 'left' | 'right';
  buttonColor?: string;
  buttonTextColor?: string;
  buttonRadius?: number;
  height?: number;
  lineColor?: string;
  items?: string[];
  author?: string;
  columns?: ColumnItem[];
}

export interface Block {
  id: string;
  type: BlockType;
  props: BlockProps;
}

export interface EmailSettings {
  backgroundColor: string;
  contentBackground: string;
  textColor: string;
  linkColor: string;
  accentColor: string;
  fontFamily: 'serif' | 'sans';
  width: number;
  preheader?: string;
}

export interface EmailDesign {
  settings: EmailSettings;
  blocks: Block[];
}

export const BRAND = {
  paper: '#f7f2e8',
  panel: '#fffdf8',
  ink: '#24201b',
  inkSoft: '#6b6155',
  line: '#ded3c0',
  accent: '#8c2230',
  accentSoft: '#f3e2e4',
  gold: '#b9863a',
  goldLight: '#d8b45c',
  sea: '#cddbe4',
  teal: '#3f7d68',
};

export const DEFAULT_SETTINGS: EmailSettings = {
  backgroundColor: BRAND.paper,
  contentBackground: BRAND.panel,
  textColor: BRAND.ink,
  linkColor: BRAND.accent,
  accentColor: BRAND.accent,
  fontFamily: 'serif',
  width: 600,
};

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: 'Titre',
  subheading: 'Sous-titre',
  text: 'Texte',
  image: 'Image',
  imageText: 'Image avec texte',
  button: 'Bouton',
  link: 'Lien',
  divider: 'Séparateur',
  spacer: 'Espace vide',
  columns2: 'Deux colonnes',
  columns3: 'Trois colonnes',
  list: 'Liste à puces',
  quote: 'Citation',
  footer: 'Pied de page',
};

export const BLOCK_TYPES = Object.keys(BLOCK_LABELS) as BlockType[];

let counter = 0;
export function newBlockId(): string {
  counter += 1;
  return `b${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultProps(type: BlockType): BlockProps {
  switch (type) {
    case 'heading':
      return { text: 'Titre de la lettre', align: 'center', fontSize: 30, paddingTop: 24, paddingBottom: 8 };
    case 'subheading':
      return { text: 'Sous-titre', align: 'left', fontSize: 21, paddingTop: 16, paddingBottom: 4 };
    case 'text':
      return { text: 'Bonjour {{prenom}},\n\nÉcrivez ici votre texte. Utilisez **gras**, *italique* et [un lien](https://sanctimaps.fr/).', align: 'left', fontSize: 16, paddingTop: 8, paddingBottom: 8 };
    case 'image':
      return { imageUrl: '', imageAlt: '', imageWidth: 100, align: 'center', url: '', paddingTop: 8, paddingBottom: 8 };
    case 'imageText':
      return { imageUrl: '', imageAlt: '', imagePosition: 'left', text: '**Un titre court**\nUn paragraphe qui accompagne l\'image.', fontSize: 15, paddingTop: 12, paddingBottom: 12 };
    case 'button':
      return { label: 'Découvrir sur SanctiMaps', url: 'https://sanctimaps.fr/', align: 'center', buttonColor: BRAND.accent, buttonTextColor: '#ffffff', buttonRadius: 6, fontSize: 16, paddingTop: 16, paddingBottom: 16 };
    case 'link':
      return { label: 'Lire la suite sur sanctimaps.fr →', url: 'https://sanctimaps.fr/', align: 'left', fontSize: 15, paddingTop: 4, paddingBottom: 4 };
    case 'divider':
      return { lineColor: BRAND.line, paddingTop: 16, paddingBottom: 16 };
    case 'spacer':
      return { height: 24 };
    case 'columns2':
      return { paddingTop: 12, paddingBottom: 12, fontSize: 15, columns: [
        { title: 'Première colonne', text: 'Un court texte.', buttonLabel: '', buttonUrl: '' },
        { title: 'Deuxième colonne', text: 'Un court texte.', buttonLabel: '', buttonUrl: '' },
      ] };
    case 'columns3':
      return { paddingTop: 12, paddingBottom: 12, fontSize: 14, columns: [
        { title: 'Un', text: 'Texte court.' }, { title: 'Deux', text: 'Texte court.' }, { title: 'Trois', text: 'Texte court.' },
      ] };
    case 'list':
      return { items: ['Premier point', 'Deuxième point', 'Troisième point'], fontSize: 16, paddingTop: 8, paddingBottom: 8 };
    case 'quote':
      return { text: 'Une citation inspirante.', author: 'Auteur', fontSize: 18, align: 'left', paddingTop: 12, paddingBottom: 12 };
    case 'footer':
      return { text: 'Vous recevez cette lettre car vous vous êtes inscrit(e) sur sanctimaps.fr.', align: 'center', fontSize: 12, color: BRAND.inkSoft, paddingTop: 24, paddingBottom: 24 };
  }
}

export function createBlock(type: BlockType): Block {
  return { id: newBlockId(), type, props: defaultProps(type) };
}
