# Adresse e-mail et SMTP

## L'adresse

Expéditeur recommandé : `newsletter@sanctimaps.fr` (configurable dans Paramètres → Expéditeur ; seul le domaine `sanctimaps.fr` est accepté). Réponse : une adresse lue par un humain.

## Quelle infrastructure SMTP ?

| Option | Adapté aux newsletters ? | Remarques |
|---|---|---|
| Gmail / Outlook.com personnel | **Non** | Envoi groupé interdit par leurs conditions, ~500/jour, domaine non aligné. |
| SMTP de l'hébergeur mail de sanctimaps.fr | Parfois | Vérifiez les conditions et quotas (souvent 200 à 500/heure). |
| Relais transactionnel (Amazon SES, Scaleway TEM, Mailjet/Brevo **en SMTP seul**, Postmark…) | **Oui** | DKIM fourni, gestion des rebonds, faible coût. Seul le transport est utilisé : abonnés, contenus et envois restent sur votre plateforme. |
| Serveur SMTP auto-hébergé (Postfix) | Déconseillé | Réputation IP difficile à construire. |

Aucune valeur SMTP n'a été inventée : renseignez celles de votre fournisseur.

## Variables (fichier `.env` sur le serveur uniquement)

```
SMTP_HOST=smtp.exemple-relais.eu
SMTP_PORT=587
SMTP_SECURITY=starttls      # ou tls (port 465)
SMTP_USER=…
SMTP_PASSWORD=…
MAIL_SANDBOX=false
```

L'interface n'affiche jamais le mot de passe et masque l'identifiant. Rien de tout cela n'est stocké en base.

## Limites

Paramètres → Envoi : taille des lots, pause entre lots, maximum par heure, tentatives. Réglez-les **sous** les quotas du relais.

## Statuts d'envoi

`En attente` → `En cours` → `Accepté par le serveur d'envoi` (≠ livré en boîte de réception) ou `Rebond` / `Échec` / `Désinscription` / `Exclu` / `Statut incertain`.

## Rebonds et plaintes — politique

| Événement | Source | Effet |
|---|---|---|
| Refus SMTP 5xx (adresse inexistante, refus permanent) | réponse immédiate du relais | abonné « Adresse en erreur » + liste d'exclusion |
| Refus 4xx (boîte pleine, refus temporaire) | réponse immédiate | nouvelles tentatives (5 min, 20 min…) jusqu'au maximum |
| 3 rebonds temporaires en 30 jours | webhook | « Adresse en erreur » |
| Rebond asynchrone permanent | webhook | idem refus 5xx |
| Plainte pour spam | webhook (boucle de rétroaction) | désinscription + exclusion **immédiates** |

### Webhook

`POST https://newsletter.sanctimaps.fr/api/webhooks/bounce`, en-tête `X-Webhook-Secret: <BOUNCE_WEBHOOK_SECRET>`, corps :

```json
[{ "type": "hard_bounce", "category": "adresse_inexistante", "email": "x@exemple.fr", "messageId": "<…>", "diagnostic": "550 5.1.1 …" }]
```

`type` : `hard_bounce` | `soft_bounce` | `complaint`. La plupart des relais permettent un webhook de ce type (directement ou via un petit adaptateur à écrire une fois le relais choisi).
