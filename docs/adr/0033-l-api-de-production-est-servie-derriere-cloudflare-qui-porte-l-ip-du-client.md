# 0033 — L'API de production est servie derrière Cloudflare, qui porte l'IP du client

- Statut : Proposé
- Date : 2026-10-23
- Décideurs : Muhammed

## Contexte et problématique

better-auth limite le débit de l'inscription, de la connexion et de l'enregistrement OAuth par IP de client (ADR 0008). Il ne déduit pas cette IP tout seul : il la lit dans l'en-tête que nomme `TRUSTED_IP_HEADER`. Sans cet en-tête, il retombe sur un compteur partagé par chemin, et tous les utilisateurs partagent alors le même quota (#106).

Un en-tête n'est fiable que si le proxy devant l'API l'écrase. Un client qui atteint l'API sans passer par ce proxy, ou qui pose l'en-tête lui-même quand le proxy ne fait que l'allonger, choisit son IP et contourne la limite.

Problématique : quel proxy sert l'API en production, et quel en-tête porte l'IP du client ?

## Facteurs de décision

- Chaque client a son propre quota d'inscription et de connexion.
- Un client ne choisit pas l'IP que la limite lui compte.
- Oublier la variable en production ne retombe pas sur le quota partagé.

## Options envisagées

### Option A — Cloudflare devant l'API, `CF-Connecting-IP`

- Avantage : Cloudflare pose `CF-Connecting-IP` à chaque requête, avec une seule IP.
- Inconvénient : l'origine doit refuser le trafic qui ne vient pas de Cloudflare, sinon l'en-tête se forge.
- **Retenue.**

### Option B — `X-Forwarded-For` du proxy de l'hébergeur

- Inconvénient : l'en-tête est une liste que chaque proxy allonge. Sans `trustedProxies`, better-auth n'accepte qu'une seule valeur : une liste de plusieurs IP retombe sur le quota partagé. Avec `trustedProxies`, il faut tenir les plages d'IP du proxy de l'hébergeur.
- **Écartée** : Cloudflare donne une seule IP sans plage à tenir.

## Décision

### 1. L'API de production est servie derrière le proxy de Cloudflare

Seul le trafic qui passe par Cloudflare atteint l'origine : un tunnel Cloudflare, ou une liste d'IP de Cloudflare sur le pare-feu de l'origine.

### 2. `TRUSTED_IP_HEADER` vaut `cf-connecting-ip` par défaut

La production n'a pas à poser la variable. Un autre environnement la pose pour son proxy.

## Conséquences

### Positives

- Chaque IP a son quota en production, sans variable à poser.
- Un client ne choisit pas son IP tant que l'origine n'accepte que Cloudflare.

### Négatives

- En local, rien ne pose `cf-connecting-ip` : better-auth compte toutes les requêtes sur l'IP locale.
- L'hébergeur de l'origine dépend de ce que Cloudflare sait joindre.

### Risques et mitigations

- **L'origine accepte du trafic hors de Cloudflare, et l'en-tête se forge** : la mise en production ferme l'origine à tout ce qui ne vient pas de Cloudflare.

## Liens

- [ADR 0008](0008-hono-pour-le-backend-better-auth-pour-l-authentification.md) — better-auth et sa limite de débit.
- [#106](https://github.com/Muhammed21/dezyn/issues/106) — la dette que cette décision ferme.
