# Installation pas à pas — site sur GitHub, données et envois chez Google

## Ce que vous allez obtenir

| Élément | Où ça se trouve | Rôle |
|---|---|---|
| Le site (studio + inscription) | GitHub Pages : https://sanctimaps-gif.github.io/Newslatter/ | Ce que vous et vos lecteurs voyez |
| Le tableur « Newsletter Studio SanctiMaps » | Votre Google Drive (privé) | La liste des abonnés, les lettres, les campagnes |
| Le script | Attaché au tableur | Enregistre les inscriptions, envoie les e-mails, toutes les 5 minutes |
| L'adresse Gmail de votre site | Votre compte Google | L'expéditeur des lettres (aucune autre adresse nécessaire) |

**Avant de commencer**
- Prévoyez **20 minutes**, sur un **ordinateur** (l'éditeur de script Google ne fonctionne pas sur téléphone), de préférence avec Chrome.
- Utilisez **le même compte Google** du début à la fin.
- Connectez-vous avec **le compte Google de votre site** : les lettres partiront de cette adresse Gmail.
- Ne m'envoyez jamais de mot de passe par message.
- Coût : 0 €. Limite : environ **100 e-mails par jour** (Gmail gratuit) ; au-delà, l'envoi continue automatiquement le lendemain.

---

## Étape 1 — Créer le tableur

*Pourquoi : c'est la « base de données » privée où seront rangés vos abonnés.*

1. Ouvrez **sheets.google.com**.
2. Cliquez sur **« Vide »** (ou le grand **+**).
3. En haut à gauche, cliquez sur **« Feuille de calcul sans titre »** et renommez-la **`Newsletter Studio SanctiMaps`**.

Ne remplissez rien : le script créera lui-même les onglets.

---

## Étape 2 — Coller le script

*Pourquoi : c'est le programme qui fait tourner la newsletter. Je l'ai préparé ; vous le copiez simplement.*

1. Dans le tableur, menu **Extensions → Apps Script**. Un nouvel onglet s'ouvre avec un fichier `Code.gs` contenant `function myFunction() { }`.
2. En haut, cliquez sur **« Projet sans titre »** et renommez-le **`Newsletter Studio`**.
3. Dans un autre onglet, ouvrez le script prêt à copier :
   **https://github.com/sanctimaps-gif/Newslatter/blob/claude/modest-rubin-enssm8/google/dist/Code.gs**
   puis cliquez sur l'icône **« Copy raw file »** (deux carrés superposés, en haut à droite du fichier).
4. Revenez dans Apps Script, cliquez dans `Code.gs`, faites **Ctrl + A** (tout sélectionner), **Suppr**, puis **Ctrl + V** (coller).
5. Dans la barre de gauche, cliquez sur la **roue dentée ⚙️ « Paramètres du projet »** et cochez **« Afficher le fichier manifeste "appsscript.json" dans l'éditeur »**.
6. Revenez à l'éditeur (icône **< >** à gauche). Un fichier **`appsscript.json`** est apparu : ouvrez-le, sélectionnez tout, et remplacez-le par le contenu de
   **https://github.com/sanctimaps-gif/Newslatter/blob/claude/modest-rubin-enssm8/google/dist/appsscript.json**
   (même méthode : « Copy raw file », puis coller).
7. Enregistrez avec l'icône **disquette 💾** (ou Ctrl + S).

---

## Étape 3 — Lancer l'installation et noter le code

*Pourquoi : cette commande crée les onglets du tableur, les 6 modèles de lettres, la vérification automatique toutes les 5 minutes, et un code secret pour créer votre compte.*

1. Dans la barre d'outils en haut, à droite de **« Déboguer »**, une liste affiche un nom de fonction : choisissez **`installer`**.
2. Cliquez sur **« ▶ Exécuter »**.
3. Google demande une autorisation :
   - **« Examiner les autorisations »** → choisissez votre compte ;
   - un écran indique **« Google n'a pas validé cette application »**. C'est normal pour un script personnel que vous avez vous-même installé : cliquez sur **« Paramètres avancés »**, puis **« Accéder à Newsletter Studio (non sécurisé) »** ;
   - lisez la liste et cliquez sur **« Autoriser »**.

   Ces autorisations servent à : écrire dans le tableur, envoyer les lettres avec Gmail, lire les avis d'e-mails non distribués, ranger les images dans Drive, vérifier vos réglages DNS, et programmer la vérification toutes les 5 minutes.
4. En bas, le **« Journal d'exécution »** affiche :
   `✅ Installation terminée. CODE D'INSTALLATION : XXXXXXXXXX`
   **Notez ce code** (10 caractères) : il sert une seule fois, à l'étape 5.

✅ Réussi si, dans le tableur, des onglets « Abonnes », « Campagnes », « Modeles »… sont apparus.
💡 Code perdu ? Relancez simplement `installer` : un nouveau code est affiché (tant que le compte n'est pas créé).

---

## Étape 4 — Publier le script pour que le site puisse lui parler

1. En haut à droite, bouton bleu **« Déployer » → « Nouveau déploiement »**.
2. À côté de « Sélectionner le type », cliquez sur la **roue dentée ⚙️** → **« Application Web »**.
3. Remplissez :
   - **Description** : `Studio`
   - **Exécuter en tant que** : **Moi** (votre adresse)
   - **Qui a accès** : **Tout le monde**
4. Cliquez sur **« Déployer »** (Google peut redemander l'autorisation : même procédure qu'à l'étape 3).
5. Une fenêtre affiche **« URL de l'application Web »**, qui se termine par **`/exec`**. Cliquez sur **« Copier »**.

*Pourquoi « Tout le monde » ?* Les visiteurs qui s'inscrivent depuis le site doivent pouvoir joindre le script. Cela **ne rend pas vos données publiques** : le tableur reste privé, et tout l'espace d'administration est protégé par votre mot de passe.

👉 **Envoyez-moi cette adresse `/exec`.** Elle n'est pas secrète. Je la relie au site (fichier `config.json`).

---

## Étape 5 — Créer votre compte administrateur

Une fois l'adresse reliée (je vous préviens) :

1. Ouvrez **https://sanctimaps-gif.github.io/Newslatter/#/admin**.
2. L'écran **« Créer le compte administrateur »** s'affiche. Saisissez :
   - le **code d'installation** de l'étape 3 ;
   - votre nom ;
   - l'adresse e-mail qui vous servira d'identifiant ;
   - un mot de passe d'au moins 12 caractères avec des lettres et des chiffres.
3. Vous arrivez sur le **tableau de bord**.

---

## Étape 6 — Les réglages avant le premier envoi

Dans le studio, menu **Paramètres** :

1. **Expéditeur** : l'adresse Gmail du site est déjà remplie ; changez seulement le nom affiché si vous le souhaitez.
2. **Envoi & SMTP** → **« Vérifier l'adresse d'expédition »** : doit afficher ✅.
3. **Domaine (DNS)** : rien à faire avec une adresse Gmail (Google gère déjà SPF, DKIM et DMARC).
4. Créez une campagne et, à l'étape « Test », **envoyez-vous un e-mail de test** : vérifiez qu'il arrive, son apparence, et le lien « Se désinscrire ».
5. **RGPD** : relisez la politique de confidentialité, complétez votre adresse de contact, cochez **« relue et validée »**.
6. **Envoi & SMTP** → activez **« Envois réels autorisés »**. Tant que les points 2 à 5 ne sont pas validés, le studio refuse d'envoyer : c'est une sécurité.

---

## Étape 7 (plus tard) — L'adresse newsletter.sanctimaps.fr

1. **IONOS** → Domaines & SSL → `sanctimaps.fr` → DNS → **Ajouter un enregistrement** : type **CNAME**, nom d'hôte **`newsletter`**, pointe vers **`sanctimaps-gif.github.io`**.
2. **GitHub** → dépôt `Newslatter` → **Settings → Pages → Custom domain** : `newsletter.sanctimaps.fr` → Save, puis cocher **Enforce HTTPS** quand c'est proposé.
3. **Apps Script** → choisir la fonction **`utiliserSousDomaine`** → Exécuter (les liens des e-mails utiliseront la nouvelle adresse).

Les réglages `@` et `www` du site principal ne sont pas touchés.

---

## Mettre à jour le script plus tard

Quand j'améliore le script : recollez `google/dist/Code.gs` (étape 2, points 3-4), puis **Déployer → Gérer les déploiements → ✏️ → Version : « Nouvelle version » → Déployer**. L'adresse `/exec` ne change pas.

## Problèmes fréquents

| Message | Solution |
|---|---|
| « Ouvrez ce script depuis le tableur » | Le script doit être créé via **Extensions → Apps Script** dans le tableur, pas depuis script.google.com. |
| « L'adresse … n'est pas configurée dans Gmail » | Dans Paramètres → Expéditeur, remettre l'adresse Gmail du site. |
| Le site affiche « Installation à terminer » | L'adresse `/exec` n'est pas encore reliée (étape 4). |
| « Code d'installation incorrect » | Relancer `installer` et utiliser le nouveau code. |
| Les e-mails partent le lendemain | Limite de 100 par jour de Gmail gratuit atteinte : c'est automatique. |

## Vérifications déjà effectuées

- 18 tests sur le fichier `Code.gs` exact (`google/test/script.test.mjs`).
- Parcours complet dans un navigateur, site + script, avec une simulation des services Google (`e2e/google.mjs`).
- Non vérifiable sans votre compte : l'exécution réelle chez Google.

## Plus tard : envoyer depuis une adresse @sanctimaps.fr

Si vous créez un jour une adresse comme `newsletter@sanctimaps.fr` (par exemple chez IONOS) :
1. Gmail → ⚙️ → Voir tous les paramètres → **Comptes et importation** → **Envoyer des e-mails en tant que** → **Ajouter une autre adresse** (serveur SMTP fourni par l'hébergeur de l'adresse, ex. `smtp.ionos.fr`, port 587, TLS) → cliquer sur le lien de vérification reçu.
2. Studio → Paramètres → **Expéditeur** : nouvelle adresse.
3. Studio → Paramètres → **Domaine (DNS)** : régler SPF, DKIM et DMARC (voir [ionos.md](ionos.md)).
