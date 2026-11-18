# Installation — site sur GitHub, données et envois chez Google

Architecture retenue :

- **Le site** (studio d'administration et pages publiques) : GitHub Pages, ce dépôt.
- **Les données et les envois** : un script Google Apps Script relié à un **tableur privé** dans votre Google Drive.
- **L'expéditeur** : votre adresse IONOS (`@sanctimaps.fr`), ajoutée dans Gmail comme « Envoyer des e-mails en tant que ». Le message passe réellement par le serveur d'IONOS.

Coût : 0 €. Limite : environ **100 e-mails par jour** avec un compte Gmail gratuit (au-delà, l'envoi reprend automatiquement le lendemain).

> Les étapes 2 à 5 se font sur **ordinateur** (l'éditeur Apps Script n'est pas utilisable sur téléphone).
> **Aucun mot de passe ne doit être envoyé par message** : celui de la boîte IONOS se saisit uniquement chez Google (étape 1).

## 1. Autoriser Gmail à envoyer avec votre adresse IONOS

Dans le compte Gmail qui gérera la lettre :

1. Gmail → ⚙️ → **Voir tous les paramètres** → onglet **Comptes et importation**.
2. **Envoyer des e-mails en tant que** → **Ajouter une autre adresse e-mail**.
3. Nom : `SanctiMaps` · Adresse : votre adresse IONOS (ex. `newsletter@sanctimaps.fr`).
4. Serveur SMTP : `smtp.ionos.fr` · Port : `587` · Nom d'utilisateur : l'adresse complète · Mot de passe : celui de la boîte IONOS · **Connexion sécurisée TLS**.
5. Google envoie un code de vérification dans la boîte IONOS : saisissez-le.

## 2. Créer le tableur

[sheets.google.com](https://sheets.google.com) → tableur vide nommé **Newsletter Studio SanctiMaps** (avec le même compte Gmail).

## 3. Coller le script

1. Dans le tableur : **Extensions → Apps Script**.
2. ⚙️ **Paramètres du projet** → cocher **Afficher le fichier manifeste « appsscript.json »**.
3. Fichier `Code.gs` : tout effacer, puis coller **tout** le contenu de
   [`google/dist/Code.gs`](../google/dist/Code.gs) (sur GitHub : bouton « Copy raw file »).
4. Fichier `appsscript.json` : remplacer par le contenu de [`google/dist/appsscript.json`](../google/dist/appsscript.json)
   (il active le service « Gmail API », nécessaire à la désinscription en un clic).
5. 💾 Enregistrer.

## 4. Installer

1. En haut, choisir la fonction **installer** → **Exécuter**.
2. Google demande des autorisations : **Examiner les autorisations** → votre compte → **Paramètres avancés** → **Accéder à … (non sécurisé)** → **Autoriser**. (Message habituel pour un script personnel.)
3. Le **journal d'exécution** affiche le **CODE D'INSTALLATION** : notez-le.

Le tableur contient maintenant les onglets (Abonnes, Campagnes, Modeles…) et un déclencheur automatique toutes les 5 minutes.

## 5. Publier le script

1. **Déployer → Nouveau déploiement** → type ⚙️ **Application Web**.
2. Exécuter en tant que : **Moi** · Qui a accès : **Tout le monde**.
3. **Déployer** → copier l'**URL de l'application Web** (elle se termine par `/exec`).

Cette adresse n'est pas secrète (elle ne donne accès à rien sans mot de passe) : transmettez-la pour que je l'inscrive dans [`config.json`](../config.json), ou modifiez vous-même ce fichier sur GitHub (champ `scriptUrl`).

## 6. Premier accès au studio

Ouvrez **https://sanctimaps-gif.github.io/Newslatter/#/admin** → « Créer le compte administrateur » → code d'installation, adresse, mot de passe (12 caractères minimum).

Puis dans **Paramètres** :

1. **Expéditeur** : votre adresse IONOS.
2. **Envoi & SMTP** → « Vérifier l'adresse d'expédition ».
3. **Domaine (DNS)** → sélecteur DKIM d'IONOS → « Vérifier maintenant » (voir [ionos.md](ionos.md)).
4. Créez une campagne et envoyez un **e-mail de test** à vous-même.
5. **RGPD** → relire la politique de confidentialité → « relue et validée ».
6. **Envoi & SMTP** → « Envois réels autorisés ».

## 7. Plus tard : l'adresse newsletter.sanctimaps.fr

1. IONOS → DNS de `sanctimaps.fr` → **ajouter** `CNAME` `newsletter` → `sanctimaps-gif.github.io`.
2. GitHub → dépôt `Newslatter` → **Settings → Pages → Custom domain** : `newsletter.sanctimaps.fr` → cocher **Enforce HTTPS** quand c'est proposé.
3. Dans Apps Script : exécuter la fonction **utiliserSousDomaine** (les liens des e-mails pointeront vers la nouvelle adresse).

Les enregistrements `@` et `www` du site principal ne sont pas touchés.

## Mettre à jour le script

Après une évolution du projet : recoller `google/dist/Code.gs`, puis **Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer** (l'adresse `/exec` reste la même).

## Où sont les données ?

Dans le tableur, visible uniquement par votre compte Google. Ne le partagez pas : il contient les adresses des abonnés. Google en est l'hébergeur (sous-traitant au sens du RGPD) : c'est indiqué dans la politique de confidentialité.

## Vérifications effectuées

- `google/test/script.test.mjs` : 18 tests sur le fichier `Code.gs` exact (installation, compte, double opt-in, envoi avec l'adresse IONOS, en-têtes List-Unsubscribe, quota Gmail, rebonds lus dans Gmail, clics, programmation, import, anonymisation, protection du tableur contre les formules).
- `e2e/google.mjs` : parcours complet dans un navigateur, site compilé + `Code.gs` exécuté dans une simulation des services Google.
- Non vérifiable depuis cet environnement : l'exécution réelle chez Google (elle se fait avec votre compte, étapes 3 à 5).
