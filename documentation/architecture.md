# Architecture

```
navigateur ──HTTPS──► Caddy ──► API Fastify (sert aussi l'interface compilée)
                                   │
sanctimaps.fr (formulaire) ──────► │ /api/public/* (CORS restreint, clé publique)
                                   ▼
                              PostgreSQL ◄──── worker (processus séparé)
                                                 │ file « scheduled_jobs » (SKIP LOCKED)
                                                 ▼
                                            relais SMTP
```

## Dossiers

| Dossier | Contenu |
|---|---|
| `shared/src` | Blocs de l'éditeur, **moteur de rendu e-mail** (utilisé à l'identique par l'aperçu et par l'envoi), 6 modèles. |
| `backend/src/routes` | `public` (inscription, confirmation, désinscription, clics, webhook rebonds), `auth`, `subscribers`, `content` (newsletters, modèles, médias, rendu), `campaigns`, `admin` (tableau de bord, stats, automatisations, paramètres, journaux, comptes). |
| `backend/src/services` | Logique métier : abonnés/double opt-in, campagnes, file d'attente, envoi SMTP, statistiques, vérification DNS, paramètres, audit. |
| `backend/src/middleware/auth.ts` | Sessions, CSRF, rôles. |
| `worker/src` | Boucle persistante : `processors/campaign.ts` (lots), `processors/emails.ts` (transactionnels), `jobs/maintenance.ts` (programmation, reprise, automatisations quotidiennes, rétention). |
| `database/migrations` | Migrations SQL versionnées (table `schema_migrations`). |
| `frontend/src` | React : `layouts`, `pages/public`, `pages/admin`, `components` (UI, éditeur), `services/api.ts` (appels centralisés), `styles/tokens.css` (système graphique). |

## Tables

`users`, `sessions`, `password_resets`, `subscribers`, `confirmation_tokens`, `consent_records`, `suppressions`, `newsletter_templates`, `newsletters`, `newsletter_blocks`, `segments`, `campaigns`, `campaign_recipients`, `campaign_links`, `campaign_events`, `scheduled_jobs`, `email_logs`, `media_files`, `settings`, `automations`, `automation_runs`, `audit_logs`.

## Cycle d'une campagne

1. `draft` → l'administrateur confirme → `queued` (immédiat) ou `scheduled`.
2. Le worker promeut les campagnes `scheduled` échues par un `UPDATE … WHERE status='scheduled' … FOR UPDATE SKIP LOCKED` : **une seule promotion possible**.
3. `campaign.prepare` fige le HTML, insère une ligne par destinataire éligible (`UNIQUE(campaign_id, subscriber_id)`), passe en `sending`.
4. `campaign.send_batch` verrouille un lot, passe chaque ligne en `sending` **avant** l'envoi, revérifie que l'abonné est toujours confirmé, envoie, enregistre `accepted` / `bounced` / nouvel essai / `failed`.
5. Lot suivant après la pause configurée ; débit horaire plafonné. Fin : `sent`.
6. Ligne restée `sending` > 15 min (arrêt brutal) → `uncertain`, **jamais renvoyée**.

## Pourquoi pas Redis ?

PostgreSQL offre une file transactionnelle et persistante suffisante pour des centaines de milliers d'envois par jour, sans service de plus à sauvegarder. Le service `queue.ts` isole cette logique : un passage à Redis/BullMQ resterait local à ce fichier.
