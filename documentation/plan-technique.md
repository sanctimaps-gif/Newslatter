# Audit et plan technique — SanctiMaps Newsletter Studio

## 0. Résultat de l'audit (phase 1)

| Élément | Constat |
|---|---|
| Dépôt courant | `sanctimaps-gif/Newslatter`, vide (aucun commit) : rien à supprimer, aucun risque d'écrasement. |
| Dépôt du site principal | `sanctimaps-gif/sanctimaps` (GitHub Pages, `CNAME = sanctimaps.fr`). **Lu en lecture seule**, jamais modifié. |
| Outils | Node.js 22, npm 10, PostgreSQL 16, Redis 7, Docker (CLI), Chromium/Playwright. |
| Accès à https://sanctimaps.fr | Refusé par le proxy réseau de l'environnement ; l'identité visuelle a été relevée directement dans le code source du site. |
| Newsletter existante | Le site possède déjà un formulaire `/lettre/` relié à un script Google Apps Script + tableur. La nouvelle plateforme le remplacera **sans** toucher au site tant que vous ne l'avez pas décidé. |

### Identité visuelle relevée (fichier `src/css/app.css` du site)

| Rôle | Clair | Sombre |
|---|---|---|
| Papier (fond) | `#f7f2e8` | `#161c23` |
| Panneau | `#fffdf8` | `#1d242c` |
| Encre | `#24201b` | `#ece5da` |
| Encre secondaire | `#6b6155` | `#a79c8c` |
| Filets | `#ded3c0` | `#333d48` |
| Accent bordeaux | `#8c2230` | `#c9505f` |
| Or (sélection, auréole) | `#b9863a` / `#d8b45c` | `#d8b45c` |
| Mer / carte | `#cddbe4`, vert d'eau `#3f7d68` | |

Typographies : titres et textes éditoriaux en serif (`Iowan Old Style`, `Palatino Linotype`, Palatino, Georgia), interface en `system-ui`.
Logo : silhouette auréolée devant un planisphère vert d'eau, « SAINTS — Carte mondiale de l'Église catholique », étoile dorée. Rayon des angles : 10 px.

## 1. Architecture recommandée

```
                 sanctimaps.fr (GitHub Pages, inchangé)
                        │  formulaire intégré (option A) ou lien (option B)
                        ▼  HTTPS, clé publique limitée à l'inscription
┌─────────────────── newsletter.sanctimaps.fr ────────────────────┐
│ Caddy (reverse proxy + HTTPS Let's Encrypt automatique)          │
│   ├── /            → frontend React (fichiers statiques)         │
│   ├── /api, /r, /media → backend Fastify (API REST)              │
│                                                                  │
│ backend ──► PostgreSQL ◄── worker (processus indépendant)        │
│                               │ file d'attente persistante       │
│                               ▼ (table jobs, SKIP LOCKED)        │
│                          relais SMTP (newsletter@sanctimaps.fr)  │
└──────────────────────────────────────────────────────────────────┘
```

* **Le navigateur de l'administrateur ne pilote jamais un envoi** : il crée des tâches en base, le worker les exécute.
* **File d'attente dans PostgreSQL** (`SELECT … FOR UPDATE SKIP LOCKED`) : persistante, transactionnelle, sans service supplémentaire. Redis n'est pas nécessaire à ce volume (jusqu'à plusieurs centaines de milliers d'envois/jour) ; l'architecture permet de le brancher plus tard.
* **Anti-doublon** : une ligne unique `(campaign_id, subscriber_id)` par destinataire ; une ligne restée « en cours » après un arrêt brutal est marquée « statut incertain » et **n'est jamais renvoyée automatiquement**.

## 2. Technologies retenues

| Couche | Choix | Justification |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS | Standard, rapide, typé ; Tailwind branché sur des variables CSS centralisées. |
| Composants | Composants maison accessibles + icônes `lucide-react` | Contrôle total du rendu SanctiMaps, pas de dépendance lourde. |
| Glisser-déposer | `@dnd-kit` | Accessible au clavier et au tactile. |
| Graphiques | `recharts` | Interactifs, légers. |
| Backend | Node.js 22 + TypeScript + **Fastify 5** | Rapide, validation de schémas, écosystème sécurité (helmet, rate-limit, cookie, multipart). |
| Validation | `zod` (partagé) | Mêmes règles côté serveur. |
| Base | **PostgreSQL 16** | Relationnel, transactions, contraintes d'unicité, sauvegardes `pg_dump`. |
| E-mail | `nodemailer` vers un relais SMTP | Aucune plateforme de newsletter commerciale. |
| Images | `sharp` | Redimensionnement, suppression des métadonnées. |
| Mots de passe | `scrypt` (Node natif, paramètres renforcés) | Hachage moderne, sans binaire tiers. |
| 2FA | TOTP RFC 6238 (implémentation interne) | Compatible Google Authenticator, Aegis, 1Password. |
| Tests | Vitest + Playwright | Unitaires, API sur vraie base, parcours navigateur. |
| Déploiement | Docker Compose + Caddy | Reproductible sur tout VPS maîtrisé. |

## 3. Structure du dépôt

```
frontend/   interface React (pages publiques + espace /admin)
backend/    API Fastify (routes, services, middleware, validateurs, config)
worker/     processus d'envoi, programmation, automatisations
shared/     rendu des e-mails (HTML tables + texte brut), blocs, modèles
database/   migrations SQL versionnées + seeds (modèles)
infrastructure/ docker, caddy, nginx
documentation/  guides en français
scripts/    utilitaires (boîte de test SMTP locale, sauvegarde)
```

## 4. Services d'infrastructure nécessaires

1. Un **VPS** (1 vCPU / 2 Go RAM suffisent au départ) — ex. Hetzner, OVHcloud, Scaleway (hébergeurs français/européens, RGPD).
2. **PostgreSQL** (dans Docker sur le VPS, ou base managée).
3. Un **relais SMTP** autorisant l'envoi en volume avec votre domaine (voir §6).
4. **DNS** de `sanctimaps.fr` (chez votre registraire actuel) : ajout d'enregistrements seulement.
5. Stockage des sauvegardes hors serveur (Object Storage S3 compatible).

## 5. Coût estimatif mensuel

| Poste | Estimation |
|---|---|
| VPS 2 Go (Hetzner CX22 / OVH VPS Starter) | 4 à 7 € |
| Sauvegardes (snapshot ou 20 Go S3) | 1 à 2 € |
| Relais SMTP : Amazon SES (0,10 $ / 1 000 e-mails) | ≈ 0,30 € pour 3 000 envois |
| ou relais européen (Scaleway TEM, 0,25 € / 1 000) | ≈ 1 € |
| ou SMTP de votre hébergeur mail (souvent limité à 200–500/jour) | 0 € (inclus) |
| Certificat HTTPS (Let's Encrypt via Caddy) | 0 € |
| **Total** | **≈ 6 à 12 € / mois** |

## 6. Besoins concernant l'adresse e-mail

* Une adresse d'expédition sur le domaine : `newsletter@sanctimaps.fr` (à créer si elle n'existe pas).
* Une adresse de réponse lue par un humain (ex. `contact@sanctimaps.fr`).
* Une adresse de retour des rebonds (`bounces@…` ou celle fournie par le relais).
* **Registraire : IONOS** (réponse du propriétaire). Le site est sur GitHub Pages, qui n'héberge pas de messagerie : l'adresse sera créée chez IONOS (boîte mail, option A) ou un relais dédié sera ajouté (option B). Voir [ionos.md](ionos.md).
* **Décision finale** : site sur GitHub Pages, données et envois chez Google (script + tableur privé), expéditeur = l'adresse Gmail du site. Pas de boîte IONOS. Liste vide au départ : aucun import.
* **Encore à préciser** : l'adresse exacte à utiliser comme expéditeur, et le quota d'envoi de l'offre IONOS. Aucune valeur SMTP n'a été inventée : la plateforme fonctionne pour l'instant avec une **boîte de test locale** qui capture tout et n'envoie rien vers Internet.

## 7. Informations DNS nécessaires (à ajouter, jamais à remplacer)

| Type | Nom | Valeur | Rôle |
|---|---|---|---|
| A / AAAA | `newsletter` | IP du VPS | sous-domaine de la plateforme |
| TXT | `@` | inclure le relais dans le SPF **existant** (`include:…`) | SPF — un seul enregistrement SPF par domaine |
| TXT ou CNAME | `<sélecteur>._domainkey` | clé fournie par le relais | DKIM |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@sanctimaps.fr` puis durcissement | DMARC |
| (option) CNAME | `bounces` | fourni par le relais | domaine de retour (Return-Path) |

Les enregistrements de GitHub Pages (`@` et `www`) **ne sont pas touchés**.

## 8. Difficultés techniques identifiées

1. **GitHub Pages ne peut pas exécuter de backend** : la plateforme doit tourner sur un VPS.
2. **Boîtes mail grand public** (Gmail, Outlook.com) : envoi en masse interdit par leurs conditions → relais SMTP dédié.
3. **Délivrabilité** : sans SPF/DKIM/DMARC alignés, Gmail et Yahoo rejettent les envois groupés (exigences 2024). La plateforme bloque les campagnes réelles tant que la vérification n'est pas passée.
4. **Mesure des ouvertures** : peu fiable (Apple Mail Privacy Protection) → désactivée par défaut, présentée comme estimation.
5. **Rebonds asynchrones** : dépendent du relais (webhook ou boîte de retour). Les rebonds synchrones (refus SMTP) sont traités directement.
6. **Migration des abonnés actuels** (tableur Google) : import CSV possible ; ils restent « en attente » sauf preuve de consentement double opt-in conservée.

## 9. Calendrier

| Phase | Contenu | Durée indicative |
|---|---|---|
| 1 Audit | ce document | fait |
| 2 Structure | dépôt, dossiers, configs, docs | fait |
| 3 Design | système graphique, menu, tableaux de bord | fait |
| 4 Backend | API, migrations, authentification, rôles | fait |
| 5 Abonnés | formulaire, double opt-in, import CSV, désinscription | fait |
| 6 Éditeur | blocs, modèles, aperçus, HTML e-mail | fait |
| 7 Campagnes | assistant, tests, file, programmation | fait |
| 8 Statistiques | graphiques, rapports, historique | fait |
| 9 Sécurité | tests d'autorisation, revue | fait |
| 10 Déploiement | guide prêt — **en attente de votre validation** (VPS, DNS, SMTP) | 1 à 2 jours après validation |
