# Déploiement sur newsletter.sanctimaps.fr

> **Rien n'a été déployé et aucun DNS n'a été modifié.** Chaque étape ci-dessous attend votre validation.

## Pourquoi pas GitHub Pages ?

GitHub Pages ne sert que des fichiers statiques : il ne peut exécuter ni l'API, ni PostgreSQL, ni le worker. Le site principal reste sur GitHub Pages ; la plateforme va sur un petit serveur.

## Hébergeur recommandé

Un VPS européen 2 Go RAM (Hetzner CX22 ≈ 4 €/mois, OVHcloud VPS ≈ 6 €/mois, Scaleway). Raisons : données dans l'UE (RGPD), prix, contrôle complet, Docker disponible.

## 1. Préparer le serveur

```bash
apt update && apt install -y docker.io docker-compose-plugin git ufw
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
git clone https://github.com/sanctimaps-gif/Newslatter.git /opt/newsletter && cd /opt/newsletter
cp .env.example .env && nano .env    # POSTGRES_PASSWORD, APP_SECRET, PUBLIC_SITE_KEY, SMTP_*, MAIL_SANDBOX=false, BOUNCE_WEBHOOK_SECRET
```

## 2. Créer le sous-domaine (DNS)

Chez le registraire de `sanctimaps.fr`, **ajouter** un seul enregistrement :

| Type | Nom | Valeur | TTL |
|---|---|---|---|
| A | `newsletter` | IP publique du VPS | 3600 |
| AAAA (si IPv6) | `newsletter` | IPv6 du VPS | 3600 |

Ne touchez **pas** aux enregistrements `@` et `www` (GitHub Pages) : le site principal continue de fonctionner à l'identique.

Vérification : `dig +short newsletter.sanctimaps.fr` doit renvoyer l'IP du VPS, et `dig +short sanctimaps.fr` toujours les IP de GitHub.

## 3. Démarrer (HTTPS automatique)

```bash
docker compose up -d --build
docker compose exec api npx tsx backend/src/scripts/create-admin.ts --email vous@sanctimaps.fr --name "Votre nom"
```

Caddy obtient le certificat Let's Encrypt dès que le DNS pointe vers le serveur.

## 4. Vérifier le certificat et les communications

```bash
curl -I https://newsletter.sanctimaps.fr/api/health          # 200 + Strict-Transport-Security
echo | openssl s_client -connect newsletter.sanctimaps.fr:443 -servername newsletter.sanctimaps.fr 2>/dev/null | openssl x509 -noout -issuer -dates
curl -I https://sanctimaps.fr/                                 # le site principal répond toujours
```

## 5. Connecter le site principal

Coller l'extrait de **Paramètres → Intégration site** dans une page du dépôt `sanctimaps` (par vous, quand vous le décidez) ou remplacer le lien de `/lettre/` par `https://newsletter.sanctimaps.fr/inscription`.

## 6. Activer l'envoi réel

1. Configurer le relais SMTP (voir email-configuration.md) puis redémarrer : `docker compose up -d`.
2. Paramètres → Envoi : « Tester la connexion SMTP ».
3. Ajouter SPF / DKIM / DMARC (dns-configuration.md), puis Paramètres → Domaine : « Vérifier maintenant ».
4. Envoyer un e-mail de test à votre adresse, vérifier la réception, le rendu, le lien de désinscription.
5. Relire la politique de confidentialité et la marquer validée.
6. Activer « Envois réels autorisés ». Première campagne : à vous-même uniquement (sélection de contacts).

## Sauvegardes

Activées par le service `backup` (voir installation.md). Copier `./backups` et le volume `media` hors du serveur.
