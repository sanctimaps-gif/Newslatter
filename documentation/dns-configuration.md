# DNS : sous-domaine, SPF, DKIM, DMARC

> Uniquement des **ajouts**. Ne modifiez ni ne remplacez `@` / `www` (GitHub Pages). Aucune modification n'est faite sans votre validation.

## Sous-domaine

`A newsletter → IP du VPS` (voir deployment.md).

## SPF (autoriser le relais à envoyer pour sanctimaps.fr)

Un domaine ne doit avoir **qu'un seul** enregistrement `v=spf1`. S'il en existe déjà un (par exemple pour votre messagerie), on y **ajoute** l'`include` du relais :

```
avant : v=spf1 include:_spf.messagerie-actuelle.fr ~all
après : v=spf1 include:_spf.messagerie-actuelle.fr include:<spf-du-relais> ~all
```

## DKIM (signature)

Le relais fournit un sélecteur et une clé (TXT) ou un CNAME : `<sélecteur>._domainkey.sanctimaps.fr`. Indiquez le sélecteur dans Paramètres → Domaine.

## DMARC

```
_dmarc.sanctimaps.fr  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@sanctimaps.fr; adkim=r; aspf=r"
```

Commencez en `p=none`, lisez les rapports 2 à 4 semaines, puis passez à `p=quarantine`.

## Vérifier

Paramètres → Domaine → « Vérifier maintenant » interroge réellement le DNS. En ligne de commande :

```bash
dig +short TXT sanctimaps.fr
dig +short TXT _dmarc.sanctimaps.fr
dig +short TXT <sélecteur>._domainkey.sanctimaps.fr
```

Puis envoyez un test à une adresse Gmail : « Afficher l'original » doit indiquer `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
