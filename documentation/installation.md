# Installation, exploitation et diagnostic

## Prérequis

Node.js 22, npm 10, PostgreSQL 16 (extension `citext`). Docker pour la production.

## Installer les dépendances

```bash
npm install
```

## Configurer la base de données

```bash
sudo -u postgres psql -c "CREATE ROLE newsletter LOGIN PASSWORD 'mot-de-passe-fort'"
sudo -u postgres psql -c "CREATE DATABASE newsletter OWNER newsletter"
sudo -u postgres psql -d newsletter -c "CREATE EXTENSION IF NOT EXISTS citext"
cp .env.example .env     # DATABASE_URL, APP_SECRET (openssl rand -hex 32), PUBLIC_SITE_KEY
npm run db:migrate       # applique database/migrations/*.sql une seule fois chacune
npm run db:seed          # 6 modèles + brouillon de politique de confidentialité
```

## Créer le premier administrateur

Il n'existe **aucun compte ni mot de passe par défaut**, et aucune inscription publique ne crée de compte.

```bash
npm run admin:create -- --email vous@sanctimaps.fr --name "Votre nom"
# le mot de passe est demandé (12 caractères min., lettres et chiffres)
```

Les comptes suivants (éditeur, lecteur) se créent dans **Paramètres → Comptes**.

## Lancer en local

```bash
npm run dev:mail     # boîte de test : http://127.0.0.1:1080 (MAIL_SANDBOX=true)
npm run dev:api
npm run dev:worker
npm run dev:web      # http://localhost:5173/admin
```

En mode bac à sable, tous les e-mails sont capturés par la boîte de test. Les adresses contenant `rebond` sont refusées en 550 et celles contenant `temporaire` en 451, pour tester le traitement des rebonds.

## Tests

```bash
createdb newsletter_test     # base dédiée, définie dans .env.test
npm test
```

## Sauvegarder

En production, le service `backup` de `docker-compose.yml` exécute `scripts/backup.sh` chaque jour (format `pg_dump -Fc`, vérification de l'archive, rotation 14 jours) dans `./backups`. Copiez ce dossier hors du serveur (Object Storage, rsync) et sauvegardez aussi le volume `media`.

Manuellement : `PGHOST=… PGUSER=newsletter PGPASSWORD=… sh scripts/backup.sh ./backups`

## Restaurer

```bash
docker compose stop api worker
docker compose exec -T db dropdb -U newsletter newsletter
docker compose exec -T db createdb -U newsletter newsletter
docker compose exec -T db pg_restore -U newsletter -d newsletter --no-owner < backups/newsletter-AAAAMMJJ-HHMMSS.dump
docker compose start api worker
```

Procédure testée : une sauvegarde a été restaurée dans une base jetable et les données relues.

## Mettre à jour

```bash
./scripts/backup.sh ./backups          # toujours sauvegarder d'abord
git pull
docker compose build && docker compose up -d   # les migrations s'appliquent au démarrage de l'API
```

## Diagnostiquer

| Symptôme | Vérification |
|---|---|
| Rien ne part | Paramètres → Envoi : « Worker d'envoi : actif » ? Sinon `docker compose logs worker`. |
| Campagne bloquée « Envoi en cours » | Limite horaire atteinte (Paramètres → Envoi) ou relais injoignable : voir Journaux → Journal des envois. |
| « Les envois réels ne sont pas encore activés » | Liste de contrôle de Paramètres → Envoi (SMTP, SPF, DKIM, DMARC, test, politique). |
| E-mails en indésirables | Paramètres → Domaine : SPF/DKIM/DMARC ; vérifiez l'alignement du domaine d'expédition. |
| Formulaire du site refusé (403) | Clé `PUBLIC_SITE_KEY` et origine présente dans `CORS_ORIGINS`. |
| Erreur 500 | `docker compose logs api` (les détails ne sont jamais renvoyés au navigateur). |
| Connexion impossible (429) | Compte verrouillé 15 min après 5 échecs ; ou réinitialisation par e-mail. |
