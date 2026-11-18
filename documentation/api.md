# API

Toutes les réponses sont en JSON. Erreurs : `{ "error": "message" }` avec le code HTTP approprié.

## Publique (utilisable par sanctimaps.fr)

### `POST /api/public/subscribe`

```json
{ "email": "lecteur@exemple.fr", "firstName": "Marie", "consent": true,
  "siteKey": "pk_sanctimaps_…", "source": "site-principal", "website": "", "startedAt": 1764000000000 }
```

| Champ | Rôle |
|---|---|
| `consent` | doit valoir `true` (case cochée par la personne) |
| `siteKey` | obligatoire depuis une autre origine ; clé **publique** limitée à cette seule route |
| `website` | champ piège : doit rester vide |
| `startedAt` | horodatage d'affichage du formulaire (anti-robots) |

Réponses : `200 { ok, message }` (identique que l'adresse soit nouvelle ou déjà inscrite), `400` données invalides, `403` clé ou origine refusée, `429` trop de requêtes (5 / 10 min / IP).

CORS : seules les origines de `CORS_ORIGINS` (par défaut `https://sanctimaps.fr`, `https://www.sanctimaps.fr`).
**Aucune clé d'administration ne doit jamais figurer dans le JavaScript du site.**

### Autres routes publiques

| Route | Usage |
|---|---|
| `GET /api/public/config` | texte de consentement et finalité |
| `POST /api/public/confirm { token }` | double opt-in |
| `GET /api/public/unsubscribe?t=` / `POST /api/public/unsubscribe { t }` | page de désinscription |
| `POST /api/public/unsubscribe/one-click?t=` | désinscription en un clic (RFC 8058) |
| `GET /api/public/privacy` | politique de confidentialité |
| `GET /r/:jeton/:lien` | redirection avec mesure du clic |
| `POST /api/webhooks/bounce` | rebonds/plaintes (secret partagé) |

## Administration (`/api/admin/*`, `/api/auth/*`)

Cookie de session `snl_session` (httpOnly, SameSite=Strict, Secure en production) + en-tête `x-csrf-token` pour toute écriture. Rôles : `viewer` (lecture), `editor` (contenus, abonnés, campagnes), `admin` (tout, dont paramètres, comptes, export, effacement).

Principales routes : `subscribers`, `subscribers/import/preview|commit`, `subscribers-export.csv`, `newsletters`, `templates`, `media`, `render`, `campaigns` (`/test`, `/send`, `/cancel`, `/duplicate`, `/recipients`), `audience/count`, `segments`, `dashboard`, `stats/campaigns`, `automations`, `settings` (`/smtp/verify`, `/domain/check`, `/real-sending`, `/dns-guide`), `logs/email`, `logs/audit`, `jobs`, `users`.
