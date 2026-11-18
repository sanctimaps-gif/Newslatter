# RGPD et prospection électronique

| Exigence | Mise en œuvre |
|---|---|
| Consentement libre, spécifique, éclairé | case non pré-cochée, texte explicite, finalité affichée, lien vers la politique |
| Preuve du consentement | table `consent_records` : texte accepté, date, source, IP tronquée, navigateur ; demande **et** confirmation |
| Double opt-in | lien unique 48 h ; aucun envoi de campagne avant confirmation |
| Imports | toujours « en attente » ; origine du consentement obligatoire ; invitation de confirmation |
| Désinscription simple | lien personnel dans chaque e-mail, sans connexion, un clic (RFC 8058), effet immédiat |
| Pas de réinscription automatique | seule une nouvelle demande confirmée par la personne réactive l'adresse |
| Liste d'exclusion | empreinte HMAC de l'adresse (désinscription, rebond, plainte, effacement) : empêche une réimportation accidentelle sans conserver l'adresse en clair |
| Droit d'accès / portabilité | export JSON depuis la fiche abonné |
| Rectification | fiche abonné |
| Effacement | anonymisation irréversible (adresse, nom, notes, IP) depuis la fiche |
| Minimisation / conservation | non-confirmés supprimés après 30 jours ; journaux d'envoi 24 mois (réglables) |
| Mesure d'audience | clics seulement ; ouvertures désactivées par défaut |
| Finalité unique | adresses utilisées uniquement pour la lettre |
| Journalisation | journal d'audit des opérations sensibles |

**À faire avant la mise en production** : compléter et faire relire la politique de confidentialité (Paramètres → RGPD), puis cocher « relue et validée ». Les campagnes réelles restent bloquées tant que ce n'est pas fait.
