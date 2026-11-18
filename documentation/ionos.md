# sanctimaps.fr chez IONOS — guide pas à pas

Le domaine `sanctimaps.fr` est enregistré chez **IONOS**. Le site reste hébergé sur GitHub Pages ; IONOS gère les **DNS** et peut fournir la **messagerie**.

> Règle : on **ajoute** des enregistrements, on ne modifie ni ne supprime ceux qui font fonctionner le site (enregistrements `A` / `CNAME` de `@` et `www` pointant vers GitHub Pages). Faites une capture d'écran de la zone DNS avant toute modification.

## Où se trouvent les DNS chez IONOS

Espace client IONOS → **Domaines & SSL** → ligne `sanctimaps.fr` → icône engrenage (Actions) → **DNS**. Le bouton **Ajouter un enregistrement** permet de créer A, TXT, CNAME…
(Les libellés peuvent légèrement varier selon la version de l'interface IONOS.)

## Choix retenu (18/11/2026)

- Une adresse `@sanctimaps.fr` existe déjà chez IONOS ; la liste ne compte encore aucun abonné.
- **Option A retenue** : envoi par le SMTP de la boîte IONOS. Passage à un relais dédié (option B) seulement si la liste dépasse le quota d'envoi IONOS.
- Aucun import d'abonnés nécessaire : la liste démarrera avec les inscriptions double opt-in.

## Étape 1 — Créer l'adresse d'expédition

Deux possibilités, à choisir :

### Option A — Boîte mail IONOS (le plus simple)

1. **E-mail** → créer `newsletter@sanctimaps.fr` (ou utiliser une boîte existante). Certaines offres de domaine IONOS incluent une boîte ; sinon, offre « Mail Basic » payante.
2. Quand une boîte IONOS est créée, IONOS ajoute en général lui-même les enregistrements **MX** et **SPF** du domaine. Vérifiez-le dans la zone DNS.
3. Paramètres SMTP à indiquer sur le serveur de la plateforme (`.env`) — à confirmer dans l'aide IONOS de votre offre :
   ```
   SMTP_HOST=smtp.ionos.fr
   SMTP_PORT=587
   SMTP_SECURITY=starttls
   SMTP_USER=newsletter@sanctimaps.fr
   SMTP_PASSWORD=<mot de passe de la boîte, uniquement dans .env sur le serveur>
   MAIL_SANDBOX=false
   ```
4. **Limite importante** : une boîte mail classique n'est pas conçue pour l'envoi en masse et IONOS applique des quotas d'envoi. Renseignez-vous sur le quota exact de votre offre et réglez **Paramètres → Envoi → Maximum par heure** en dessous. Adapté tant que la liste reste petite (quelques centaines d'abonnés).

### Option B — Relais d'envoi dédié (recommandé dès que la liste grandit)

Scaleway Transactional Email (France) ou Amazon SES (région Paris). La boîte IONOS reste utilisée pour **recevoir** (adresse de réponse) ; le relais sert uniquement à **envoyer**. Le relais fournit ses propres valeurs SPF et DKIM à ajouter chez IONOS (étape 3).

## Étape 2 — Créer le sous-domaine `newsletter`

Seulement quand le serveur (VPS) existe et que vous avez validé le déploiement :

| Type | Nom d'hôte | Pointe vers | TTL |
|---|---|---|---|
| A | `newsletter` | adresse IP du VPS | 1 heure |

Ne touchez pas aux enregistrements de `@` et `www`.

## Étape 3 — SPF, DKIM, DMARC

**SPF** — un seul enregistrement `TXT` commençant par `v=spf1` sur `@`. Si IONOS en a déjà créé un (option A), **ne pas en ajouter un second** : avec l'option B, on ajoute l'`include:` du relais à l'intérieur de l'enregistrement existant.

**DKIM** — option A : vérifiez dans le panneau IONOS si la signature DKIM est activée pour le domaine. Option B : ajoutez le `CNAME` / `TXT` `<sélecteur>._domainkey` fourni par le relais.

**DMARC** — ajouter :

| Type | Nom d'hôte | Valeur |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:newsletter@sanctimaps.fr; adkim=r; aspf=r` |

## Étape 4 — Vérifier

Dans le Studio : **Paramètres → Domaine** → indiquer le sélecteur DKIM → **Vérifier maintenant**, puis **Paramètres → Envoi** → **Tester la connexion SMTP** et envoyer un e-mail de test à votre adresse personnelle. La propagation DNS prend de quelques minutes à quelques heures.
