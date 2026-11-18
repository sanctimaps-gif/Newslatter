# SanctiMaps Newsletter Studio

Plateforme privée et indépendante de gestion de la lettre d'information de [sanctimaps.fr](https://sanctimaps.fr/), destinée à `https://newsletter.sanctimaps.fr/`.

- **Abonnés** : inscription double opt-in, preuves de consentement, import CSV, export, anonymisation RGPD.
- **Éditeur visuel** : 14 blocs, glisser-déposer, médiathèque, aperçus ordinateur / mobile / rendu final, HTML compatible messageries.
- **Campagnes** : assistant en 6 étapes, e-mail de test, envoi immédiat ou programmé, file d'attente serveur sans double envoi.
- **Suivi** : rebonds, plaintes, clics, désinscriptions (List-Unsubscribe en un clic), statistiques issues d'événements réels.
- **Sécurité** : sessions httpOnly, CSRF, 2FA, rôles, limitation de débit, validation serveur, journal d'audit.

## Démarrage rapide (local)

```bash
npm install
cp .env.example .env            # puis compléter DATABASE_URL et APP_SECRET
npm run db:migrate && npm run db:seed
npm run admin:create -- --email vous@sanctimaps.fr --name "Votre nom"
npm run dev:mail     # boîte de test SMTP  → http://127.0.0.1:1080
npm run dev:api      # API                  → http://localhost:3000
npm run dev:worker   # worker d'envoi
npm run dev:web      # interface            → http://localhost:5173/admin
```

## Tests

```bash
npm test                                    # 45 tests API (base PostgreSQL de test) + tests interface
ADMIN_EMAIL=… ADMIN_PASSWORD=… node e2e/parcours.mjs   # parcours complet dans un navigateur
```

## Documentation

| Sujet | Fichier |
|---|---|
| Audit et plan technique | [documentation/plan-technique.md](documentation/plan-technique.md) |
| Architecture | [documentation/architecture.md](documentation/architecture.md) |
| Installation, sauvegarde, restauration, mise à jour, diagnostic | [documentation/installation.md](documentation/installation.md) |
| Déploiement et sous-domaine | [documentation/deployment.md](documentation/deployment.md) |
| Adresse e-mail et SMTP, rebonds | [documentation/email-configuration.md](documentation/email-configuration.md) |
| DNS (SPF, DKIM, DMARC) | [documentation/dns-configuration.md](documentation/dns-configuration.md) |
| API et intégration au site principal | [documentation/api.md](documentation/api.md) |
| Sécurité | [documentation/security.md](documentation/security.md) |
| RGPD | [documentation/rgpd.md](documentation/rgpd.md) |

Le dépôt du site principal (`sanctimaps-gif/sanctimaps`) n'est jamais modifié par ce projet.
