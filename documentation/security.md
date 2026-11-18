# Sécurité

| Risque | Mesure | Fichier |
|---|---|---|
| Injection SQL | requêtes paramétrées uniquement ; tris par liste blanche | `backend/src/routes/*.ts` |
| XSS | React échappe le rendu ; le moteur e-mail échappe tout texte, n'accepte que `http(s)`/`mailto` et des couleurs hexadécimales ; Markdown de la politique sans HTML ; CSP Helmet | `shared/src/render.ts` |
| CSRF | jeton par session exigé en en-tête sur toute écriture + cookie SameSite=Strict + contrôle d'origine | `middleware/auth.ts`, `app.ts` |
| Sessions | jeton aléatoire 256 bits, stocké **haché**, httpOnly, Secure, expiration 12 h, invalidation à la déconnexion et au changement de mot de passe | `middleware/auth.ts` |
| Mots de passe | scrypt (N=2¹⁵), 12 caractères min., aucun mot de passe par défaut | `lib/crypto.ts` |
| Force brute | 10 essais/min/IP + verrouillage 15 min après 5 échecs ; 2FA TOTP (secret chiffré AES-256-GCM) | `routes/auth.ts` |
| Permissions | rôles vérifiés côté serveur sur chaque route | tests `auth.test.ts` |
| Abus de l'inscription | limitation par IP, champ piège, délai minimal, réponse neutre, anti-renvoi 2 min par adresse | `routes/public.ts` |
| Fichiers | signature binaire vérifiée (pas le type annoncé), ré-encodage `sharp`, métadonnées supprimées, 5 Mo, noms aléatoires, `nosniff` + CSP sur `/media` | `routes/content.ts` |
| CSV | 2 Mo, 10 000 lignes, détection de binaire ; export protégé contre l'injection de formules | `routes/subscribers.ts` |
| Jetons | confirmation : aléatoires, hachés, usage unique, 48 h ; désinscription et clics : signés HMAC | `lib/crypto.ts` |
| Secrets | variables d'environnement uniquement, `.env` ignoré par git, SMTP masqué dans l'interface | `.gitignore`, `services/mailer.ts` |
| Traçabilité | journal d'audit (connexions, exports, effacements, envois, paramètres) | `services/audit.ts` |
| Transport | HTTPS obligatoire via Caddy + HSTS | `infrastructure/caddy/Caddyfile` |

## Tests de sécurité automatisés

`backend/tests` : accès sans session (401 sur toutes les routes privées), CSRF manquant/faux, rôles lecteur/éditeur, verrouillage, 2FA, injection SQL, XSS et `javascript:` dans le rendu, faux fichier image, jetons expirés/réutilisés/falsifiés, secret de webhook invalide, mots de passe jamais en clair.

## Défauts trouvés et corrigés pendant les tests

- Désinscription en un clic refusée (415) car Gmail l'envoie en `x-www-form-urlencoded` → analyseur ajouté.
- Filtre de statut trop court rendant la page Programmation inutilisable → limite corrigée.
