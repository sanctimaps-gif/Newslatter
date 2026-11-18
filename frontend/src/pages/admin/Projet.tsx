import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Clock3 } from 'lucide-react';
import { Card, PageHeader } from '../../components/ui';

type Status = 'fait' | 'attente' | 'partiel';
interface Step { n: number; title: string; status: Status; done: string[]; where?: { label: string; to: string }[] }

/** Suivi des 32 sections du cahier des charges (0 à 31), avec ce qui a été réalisé et où le constater. */
const STEPS: Step[] = [
  { n: 0, title: 'Rôle et mission', status: 'fait', done: ['Application réelle (pas une maquette) : API, base PostgreSQL, worker, interface.', 'Dépôt indépendant sanctimaps-gif/Newslatter ; aucune plateforme commerciale de newsletter.'] },
  { n: 1, title: 'Informations générales', status: 'fait', done: ['Pages publiques /inscription, /confirmation, /desinscription, /confidentialite.', 'Pages privées /admin, /admin/abonnes, /admin/newsletters, /admin/creer, /admin/campagnes, /admin/modeles, /admin/statistiques, /admin/automatisations, /admin/parametres.', 'Le dépôt du site principal n\'a été que lu, jamais modifié.'], where: [{ label: 'Inscription', to: '/inscription' }] },
  { n: 2, title: 'Objectif principal (16 actions)', status: 'fait', done: ['Les 16 actions de l\'administrateur sont disponibles : tableau de bord, abonnés, import, création, apparence, images/liens, aperçu, test, envoi, programmation, annulation, statistiques, historique, désinscriptions, adresse d\'expédition, modèles.'] },
  { n: 3, title: 'Identité visuelle', status: 'fait', done: ['Couleurs, polices et logo relevés dans le code source du site (papier #f7f2e8, encre #24201b, bordeaux #8c2230, or #b9863a, serif Palatino).', 'Variables CSS centralisées (couleurs, espacements, rayons, ombres, polices) ; thème clair + thème sombre optionnel.'] },
  { n: 4, title: 'Structure et menu latéral', status: 'fait', done: ['Menu fixe (ordinateur), rétractable (tablette), tiroir (mobile) avec les 10 rubriques.', 'Profil, paramètres du compte, déconnexion en bas ; fil d\'Ariane sur toutes les pages.'] },
  { n: 5, title: 'Tableau de bord', status: 'fait', done: ['9 indicateurs issus de la base, 4 graphiques interactifs, périodes 7 j / 30 j / 90 j / 12 mois / personnalisée.', 'Activité récente : inscriptions, campagnes, envois, désinscriptions, erreurs. États vides explicatifs, aucun chiffre fictif.'], where: [{ label: 'Tableau de bord', to: '/admin' }] },
  { n: 6, title: 'Gestion des abonnés', status: 'fait', done: ['Tableau avec recherche instantanée, filtres statut/source, tris, pagination ; fiche, ajout, modification, export CSV, anonymisation.', '5 statuts ; jamais d\'envoi aux non-confirmés ; import CSV en 8 étapes sans jamais confirmer automatiquement.'], where: [{ label: 'Abonnés', to: '/admin/abonnes' }] },
  { n: 7, title: 'Formulaire public d\'inscription', status: 'fait', done: ['Prénom facultatif, e-mail, consentement explicite, finalité, lien confidentialité.', 'Double opt-in, jetons aléatoires hachés, à usage unique, expirant en 48 h ; preuve du consentement enregistrée.', 'Anti-robots (champ piège, délai minimal), limitation par IP, réponse neutre.'], where: [{ label: 'Voir la page', to: '/inscription' }] },
  { n: 8, title: 'Connexion avec le site principal', status: 'fait', done: ['API POST /api/public/subscribe : validation serveur, CORS restreint, clé publique limitée, limitation de débit, réponses JSON.', 'Extraits prêts à coller : formulaire intégré (A) et bouton (B). Documentation : documentation/api.md.'], where: [{ label: 'Intégration', to: '/admin/parametres?onglet=integration' }] },
  { n: 9, title: 'Éditeur visuel', status: 'fait', done: ['14 blocs ; ajout, suppression, duplication, glisser-déposer (souris, tactile, clavier), édition directe du texte.', 'Couleurs, tailles, alignements, espacements, arrière-plans, liens ; bibliothèque d\'images (téléversement contrôlé, remplacement, suppression, texte alternatif, optimisation).', 'Aperçus ordinateur / mobile / rendu final + données d\'exemple ; HTML en tableaux, styles en ligne, version texte, pied de page légal obligatoire.'], where: [{ label: 'Créer', to: '/admin/creer' }] },
  { n: 10, title: 'Modèles', status: 'fait', done: ['6 modèles de départ en base (classique, éditorial, image principale, actualités, promotionnel, minimaliste).', 'Créer, modifier, dupliquer, supprimer, utiliser lors d\'une campagne.'], where: [{ label: 'Modèles', to: '/admin/modeles' }] },
  { n: 11, title: 'Assistant de campagne', status: 'fait', done: ['6 étapes : informations, contenu, destinataires (tous / segment / sélection, nombre exact), test contrôlé, récapitulatif + aperçu, envoi immédiat ou programmé avec confirmation explicite.'], where: [{ label: 'Nouvelle campagne', to: '/admin/campagnes/nouvelle' }] },
  { n: 12, title: 'Programmation', status: 'fait', done: ['Date, heure, fuseau (Europe/Paris par défaut), stockage UTC.', 'Liste, modification, annulation ; exécution par le worker serveur ; transition atomique qui empêche tout double envoi.'], where: [{ label: 'Programmation', to: '/admin/programmation' }] },
  { n: 13, title: 'Système d\'envoi', status: 'partiel', done: ['File d\'attente PostgreSQL, préparation / envoi / suivi séparés, lots, limites horaires, tentatives limitées, pauses, journal, anti-doublon.', 'Statuts : en attente, en cours, accepté par le serveur d\'envoi, rebond, échec, désinscription, incertain.', 'Secrets SMTP uniquement en variables d\'environnement, masqués. Guide SPF/DKIM/DMARC et vérification DNS réelle.', 'En attente : vos identifiants SMTP réels (aucun n\'a été inventé). Actuellement en bac à sable : rien ne sort sur Internet.'], where: [{ label: 'Envoi & SMTP', to: '/admin/parametres?onglet=envoi' }] },
  { n: 14, title: 'Rebonds et plaintes', status: 'fait', done: ['Refus SMTP 5xx → rebond permanent (adresse en erreur + exclusion) ; 4xx → nouvelles tentatives ; 3 rebonds temporaires en 30 jours → adresse en erreur.', 'Webhook sécurisé pour les notifications du relais ; plainte → exclusion immédiate. Politique documentée.'] },
  { n: 15, title: 'Désinscription', status: 'fait', done: ['Lien personnel signé dans chaque e-mail, page sans connexion, date enregistrée, exclusion immédiate.', 'En-têtes List-Unsubscribe et List-Unsubscribe-Post (un clic RFC 8058). Jamais de réactivation automatique.'], where: [{ label: 'Page', to: '/desinscription' }] },
  { n: 16, title: 'Statistiques', status: 'fait', done: ['Ciblés, acceptés, rebonds, clics, désinscriptions, taux de clics ; ouvertures facultatives présentées comme estimations (désactivées par défaut).', 'Fiche détaillée par campagne, filtre par période.'], where: [{ label: 'Statistiques', to: '/admin/statistiques' }] },
  { n: 17, title: 'Automatisations', status: 'fait', done: ['Bienvenue, notification d\'inscription, relance éditoriale, abonnés inactifs (signalement seul), purge des non-confirmés ; toutes activables/désactivables, exécutions tracées.'], where: [{ label: 'Automatisations', to: '/admin/automatisations' }] },
  { n: 18, title: 'Comptes administrateurs', status: 'fait', done: ['Connexion, déconnexion, réinitialisation, sessions httpOnly, CSRF, verrouillage après 5 échecs, 2FA TOTP.', 'Rôles administrateur / éditeur / lecteur ; premier compte créé en ligne de commande, aucun mot de passe par défaut.'], where: [{ label: 'Compte', to: '/admin/compte' }] },
  { n: 19, title: 'RGPD', status: 'partiel', done: ['Consentement explicite, double opt-in, preuves, accès (export JSON), rectification, effacement par anonymisation, liste d\'exclusion, durées de conservation, journal d\'audit.', 'En attente : relecture et validation de la politique de confidentialité par vos soins.'], where: [{ label: 'RGPD', to: '/admin/parametres?onglet=confidentialite' }] },
  { n: 20, title: 'Sécurité technique', status: 'fait', done: ['Validation zod, requêtes paramétrées, échappement XSS, CSRF, rôles, limitation de débit, scrypt, AES-256-GCM pour la 2FA, contrôle des fichiers par signature, en-têtes Helmet/CSP, journal d\'audit.', 'Migrations, tests de sécurité et d\'autorisation, procédures de sauvegarde/restauration documentées.'] },
  { n: 21, title: 'Architecture technique', status: 'fait', done: ['React + TypeScript + Vite + Tailwind ; Fastify + TypeScript ; PostgreSQL ; worker indépendant ; Docker Compose + Caddy (HTTPS).'] },
  { n: 22, title: 'Structure des fichiers', status: 'fait', done: ['frontend/, backend/, worker/, shared/, database/, infrastructure/, documentation/, scripts/, .env.example, docker-compose.yml, README.md.'] },
  { n: 23, title: 'Sous-domaine', status: 'attente', done: ['Guide complet (documentation/deployment.md, dns-configuration.md) : création, DNS, HTTPS, vérification du certificat, préservation du site principal.', 'En attente de votre validation : aucun DNS modifié, rien déployé.'] },
  { n: 24, title: 'Mobiles', status: 'fait', done: ['Menu tiroir, tableaux en cartes, formulaires et boutons tactiles (40 px min.), éditeur avec onglets blocs/propriétés.'] },
  { n: 25, title: 'Accessibilité', status: 'fait', done: ['Contrastes, navigation clavier, lien d\'évitement, labels, messages d\'erreur, dialogues accessibles (focus piégé, Échap), confirmation des actions sensibles, textes alternatifs.'] },
  { n: 26, title: 'Tests', status: 'fait', done: ['45 tests backend sur vraie base (auth, rôles, API d\'inscription, confirmation, désinscription, campagnes, programmation, envoi, erreurs, sécurité, import).', 'Tests frontend (composants) et parcours navigateur Playwright (pages, navigation, mobile).'] },
  { n: 27, title: 'Documentation', status: 'fait', done: ['En français : installation, lancement local, base, premier administrateur, e-mail, SMTP, DNS, déploiement, sauvegarde, restauration, mise à jour, diagnostic.'] },
  { n: 28, title: 'Méthode (10 phases)', status: 'partiel', done: ['Phases 1 à 9 réalisées et vérifiées.', 'Phase 10 (déploiement) préparée, en attente de votre autorisation.'] },
  { n: 29, title: 'Règles absolues', status: 'fait', done: ['Site principal intact, aucun secret publié, aucune donnée SMTP inventée, aucun envoi réel, aucune statistique fictive, aucun déploiement ni DNS sans validation.'] },
  { n: 30, title: 'Critères de réussite', status: 'partiel', done: ['Opérationnels localement : connexion, inscription, double opt-in, PostgreSQL, contacts, éditeur, enregistrement, programmation, désinscription, suivi des erreurs, statistiques réelles, documentation, sauvegardes, tests.', 'Restent : mise en ligne sur newsletter.sanctimaps.fr et envois réels (nécessitent votre serveur, vos DNS et votre SMTP).'] },
  { n: 31, title: 'Audit et plan technique', status: 'fait', done: ['Architecture, technologies, structure, services, coûts (≈ 6 à 12 €/mois), besoins e-mail, DNS, difficultés, calendrier : documentation/plan-technique.md.'] },
];

const ICON = { fait: CheckCircle2, attente: Clock3, partiel: CircleDashed };
const TONE = { fait: 'text-ok', attente: 'text-info', partiel: 'text-warn' };
const LABEL = { fait: 'Réalisé', attente: 'Prêt — attend votre validation', partiel: 'Réalisé — un point attend votre action' };

export default function ProjetPage() {
  const counts = STEPS.reduce((a, s) => ({ ...a, [s.status]: (a[s.status] ?? 0) + 1 }), {} as Record<Status, number>);
  return (
    <>
      <PageHeader title="Suivi du cahier des charges" crumbs={[{ label: 'Cahier des charges' }]} description="Les 32 sections (0 à 31) du cahier des charges, ce qui a été réalisé, et où le vérifier dans le studio." />
      <div className="flex flex-wrap gap-3 mb-6 text-sm">
        {(Object.keys(LABEL) as Status[]).map((k) => { const I = ICON[k]; return <span key={k} className="card px-3 py-2 flex items-center gap-2"><I className={`h-4 w-4 ${TONE[k]}`} />{LABEL[k]} : <strong>{counts[k] ?? 0}</strong></span>; })}
      </div>
      <ol className="grid md:grid-cols-2 gap-4">
        {STEPS.map((s) => { const I = ICON[s.status]; return (
          <li key={s.n}><Card>
            <div className="flex items-start gap-3">
              <span className="font-display text-2xl font-semibold text-gold w-9 shrink-0 tabular-nums">{s.n}</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-[16px] flex items-center gap-2 flex-wrap">{s.title}<span className={`inline-flex items-center gap-1 text-xs font-medium ${TONE[s.status]}`}><I className="h-4 w-4" aria-hidden />{LABEL[s.status]}</span></h2>
                <ul className="mt-2 text-sm text-ink space-y-1 list-disc pl-4">{s.done.map((d, i) => <li key={i}>{d}</li>)}</ul>
                {s.where && <div className="mt-3 flex gap-2 flex-wrap">{s.where.map((w) => <Link key={w.to} to={w.to} className="btn-secondary btn-sm no-underline">{w.label} →</Link>)}</div>}
              </div>
            </div>
          </Card></li>); })}
      </ol>
    </>
  );
}
