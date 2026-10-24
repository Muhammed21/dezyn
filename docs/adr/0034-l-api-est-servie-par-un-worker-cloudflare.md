# 0034 — L'API est servie par un Worker Cloudflare

- Statut : Accepté
- Date : 2026-10-24
- Décideurs : Muhammed
- Amende : ADR 0033 (§1 : il n'y a plus d'origine à fermer, le Worker reçoit les requêtes directement)

## Contexte et problématique

L'API n'a pas d'hébergement : `release.yml` le dit, « the hosting is not chosen ». L'ADR 0033 prévoit une origine Node derrière le proxy de Cloudflare, fermée à tout trafic qui ne vient pas de Cloudflare.

Le domaine `dezyn.app` a sa zone sur Cloudflare. L'API doit être servie sur `api.dezyn.app`, et chaque commit d'une PR doit publier une version de test de l'API.

Le code est presque prêt pour un Worker. Le MCP utilise déjà `WebStandardStreamableHTTPServerTransport`, et la crypto passe par `node:crypto`, que Workers fournit avec `nodejs_compat`. Trois choses manquent :

- une Postgres joignable depuis Cloudflare ;
- un remplaçant au SMTP de `nodemailer` ;
- un point d'entrée `fetch` à la place de `@hono/node-server`.

Deux comportements dépendent aussi du processus Node. better-auth compte ses limites de débit en mémoire (ADR 0008). Et l'API vérifie la version du schéma au démarrage (ADR 0009 §4).

Problématique : où et comment l'API est-elle servie en production et dans les previews de PR ?

## Facteurs de décision

- L'API est servie sur `api.dezyn.app`.
- Chaque commit d'une PR publie une preview de l'API, avec son URL.
- Une preview ne peut toucher ni les données ni les secrets de la production, même par erreur.
- Aucune donnée réelle d'utilisateur n'arrive dans une preview.
- Les minutes GitHub Actions sont comptées.
- Une migration d'une PR ne casse pas les previews des autres PR.

## Options envisagées

### Où tourne le code de l'API

#### Option A — Un Worker Cloudflare

- Avantage : le Worker sert `api.dezyn.app` directement, et Wrangler publie une version de test par commit, avec son URL.
- Avantage : il n'y a plus d'origine à protéger, et `cf-connecting-ip` vient de Cloudflare.
- Inconvénient : il faut remplacer `nodemailer` et joindre Postgres depuis le Worker.
- **Retenue.**

#### Option B — Cloudflare Containers

- Avantage : le serveur Node tourne tel quel dans un conteneur, derrière un Worker.
- Inconvénient : le produit est plus jeune et plus cher, et les previews sont moins directes.
- **Écartée.**

#### Option C — Une origine Node ailleurs, derrière le proxy Cloudflare

- Inconvénient : c'est l'ADR 0033 §1, et les previews dépendent alors de l'hébergeur de l'origine.
- **Écartée.**

### Où vit la base

#### Option A — Neon

- Avantage : Neon crée une branche de la base en quelques secondes, d'où une base par preview.
- **Retenue.**

#### Option B — Supabase, ou une Postgres classique

- Inconvénient : pas de branches bon marché.
- **Écartée.**

### Avec quelle base tourne une preview

#### Option A — Une branche Neon par PR, tirée d'une branche parente remplie par le seed

- **Retenue.**

#### Option B — Une base de staging partagée par toutes les previews

- Inconvénient : une migration d'une PR casse les previews des autres.
- **Écartée.**

#### Option C — Des branches tirées de la production

- Inconvénient : des données personnelles réelles finissent sur des URLs de test.
- **Écartée.**

### Comment une preview joint sa branche

#### Option A — En direct, avec `pg` en TCP

- Inconvénient : l'URL de la branche, mot de passe compris, est visible dans le tableau de bord du Worker de preview. Elle n'ouvre qu'une branche de données de seed.
- **Retenue.**

#### Option B — Une config Hyperdrive par PR

- Inconvénient : le job crée et supprime une config à chaque PR.
- **Écartée.**

### Un ou deux Workers

#### Option A — Un Worker pour la production, un pour les previews

- **Retenue.**

#### Option B — Un seul Worker, en surchargeant tout à chaque upload

- Inconvénient : les versions d'un Worker partagent ses secrets et ses bindings. Un oubli donne à une preview le secret de production et sa base.
- **Écartée.**

### Par quoi passent les emails

#### Option A — Cloudflare Email Service

- Avantage : un binding `send_email`, sans clé d'API à gérer.
- **Retenue.**

#### Option B — Un fournisseur HTTP (Resend, Postmark) appelé avec `fetch`

- **Écartée** au profit de A.

### Qui déploie

#### Option A — GitHub Actions

- Avantage : le job garde l'ordre « branche, migrations, upload » et commente la PR.
- Inconvénient : chaque push consomme une à deux minutes d'Actions.
- **Retenue.**

#### Option B — Cloudflare Workers Builds

- Avantage : aucune minute d'Actions.
- Inconvénient : la branche Neon et les migrations passent par la commande de build, moins lisible et moins contrôlable.
- **Écartée.**

### Dans quel ordre passent la migration et le déploiement

#### Option A — Migrer, puis publier

- Inconvénient : l'ancienne version tourne un moment sur le nouveau schéma.
- **Retenue.**

#### Option B — Publier, puis migrer

- Inconvénient : la nouvelle version tourne un moment sur l'ancien schéma.
- **Écartée.**

### Où better-auth compte ses limites de débit

#### Option A — En base, `storage: "database"`

- Inconvénient : une migration, et une écriture par requête d'authentification.
- **Retenue.**

#### Option B — Le binding Rate Limiting de Cloudflare

- Inconvénient : il n'est pas branché sur better-auth et demande un adaptateur.
- **Écartée.**

#### Option C — KV

- Inconvénient : sa cohérence éventuelle ne convient pas à un compteur.
- **Écartée.**

### Comment les ressources sont créées

#### Option A — À la main, une fois, en suivant un guide versionné dans `docs/`

- Avantage : peu de ressources, qui changent rarement, sans outil de plus.
- **Retenue.**

#### Option B — De l'infrastructure en code (Terraform, Pulumi)

- **Écartée.**

## Décision

### 1. La production est servie par le Worker `dezyn-api` sur `api.dezyn.app`

Un point d'entrée `worker.ts` réutilise `buildApi` et sert toute l'API : HTTP, MCP et OAuth. Il joint la branche `main` de Neon par Hyperdrive. Il n'y a pas d'origine : le §1 de l'ADR 0033 ne s'applique plus, son §2 reste (`TRUSTED_IP_HEADER` vaut `cf-connecting-ip` par défaut).

`main.ts` et le serveur Node restent pour le dev local et les tests.

### 2. Les previews sont des versions du Worker `dezyn-api-preview`

`dezyn-api-preview` n'a aucun secret ni binding de production. Chaque commit d'une PR, une fois sa CI verte, en publie une version. Une PR venue d'un fork n'a pas de preview.

La version porte l'alias de sa PR, `pr-<N>`. L'URL de cet alias est la `baseURL` de better-auth et le `WEB_URL` de la preview. L'URL propre au commit sert à consulter l'API, sans OAuth.

### 3. Chaque PR a sa branche Neon, tirée de la branche `preview`

La branche `preview` est remplie par le seed, jamais par la production. La preview joint sa branche en direct, avec `pg` en TCP. À la fermeture de la PR, sa branche est supprimée ; les versions mortes restent sur Cloudflare.

### 4. Les secrets de production ne quittent pas Cloudflare

Le `BETTER_AUTH_SECRET` de production est posé sur `dezyn-api` avec `wrangler secret`, et nulle part ailleurs. Les previews partagent un autre secret, rangé dans GitHub. C'est aussi celui de la branche `preview`, dont les clés JWKS sont chiffrées avec lui.

L'environnement GitHub `production`, réservé à `main`, porte le jeton Cloudflare de production et l'URL du rôle `migrator` de Neon. Les previews ont un jeton Cloudflare limité à `dezyn-api-preview` et un jeton Neon.

### 5. GitHub Actions migre, puis publie

Un job court migre avec le rôle `migrator` (ADR 0009 §3), puis publie le Worker. Chaque migration reste compatible avec la version précédente de l'API : on ajoute d'abord, on retire dans une PR suivante. La vérification du schéma (ADR 0009 §4) a lieu une fois par isolat.

La production part au merge sur `main`, une fois la CI de `main` verte. Le job appelle ensuite `GET /health` sur `api.dezyn.app`, et revient à la version précédente avec `wrangler rollback` s'il échoue. Une preview appelle aussi `/health` après son upload, puis son URL est commentée sur la PR.

### 6. Les emails passent par Cloudflare Email Service

Un adaptateur du port `Mailer` envoie par le binding `send_email`. Les previews n'envoient pas d'email : elles le journalisent.

### 7. better-auth compte ses limites de débit en base

`rateLimit` passe en `storage: "database"`, pour que la limite de l'ADR 0008 tienne d'un isolat à l'autre.

### 8. Les logs vont dans Workers Logs

Les deux Workers écrivent les mêmes lignes JSON avec `console.log`, et Workers Logs les garde.

### 9. Les ressources sont créées à la main, avec un guide

Le compte, les Workers, Hyperdrive, Email Service, le projet Neon et ses branches, et les jetons sont créés une fois, en suivant un guide de `docs/`. Le dépôt contient `wrangler.jsonc` et les workflows.

## Conséquences

### Positives

- Une preview par commit, avec sa base, sans toucher la production.
- Il n'y a pas d'origine à fermer : `cf-connecting-ip` ne se forge pas.
- Aucune donnée réelle dans une preview.
- Le secret de production n'est lisible ni par GitHub ni par une preview.

### Négatives

- Chaque migration doit rester compatible avec la version précédente, ce qui coûte parfois deux PR.
- Une requête d'authentification écrit en base pour son compteur.
- Le Worker et le serveur Node sont deux points d'entrée ; les tests passent par le second.
- Chaque push de PR consomme une à deux minutes d'Actions de plus.
- L'URL d'une branche Neon de preview, mot de passe compris, est visible dans le tableau de bord de `dezyn-api-preview`.
- Les versions mortes des previews restent sur Cloudflare.
- Les ressources créées à la main peuvent dériver du guide.
- Tant que l'adaptateur d'email n'est pas branché, la production ne peut pas envoyer d'invitation.

### Risques et mitigations

- **Une dépendance ne tourne pas dans un Worker** (`pg`, better-auth, le SDK MCP) : l'appel à `/health` de chaque preview, après l'upload, le voit avant la production.
- **Une migration casse la version encore en ligne** : la règle du §5, et la revue `critical` des migrations (ADR 0009).
- **Le déploiement de production casse l'API** : `/health` après le déploiement, et `wrangler rollback` s'il échoue.
- **Le secret des previews diffère de celui de la branche `preview`** : better-auth ne déchiffre plus la clé JWKS et l'émission des jetons répond 500 (#127). Le guide pose le même secret aux deux endroits.

## Notes d'implémentation

1. Squelette de production : `worker.ts`, `wrangler.jsonc`, Hyperdrive, le déploiement au merge et `/health`. Les emails y sont seulement journalisés.
2. Preview par commit de PR.
3. Limites de débit en base, avec leur migration.
4. Adaptateur Cloudflare Email Service.
5. Guide de mise en place dans `docs/`.

## Liens

- [ADR 0033](0033-l-api-de-production-est-servie-derriere-cloudflare-qui-porte-l-ip-du-client.md) — amende son §1 ; son §2 reste.
- [ADR 0008](0008-hono-pour-le-backend-better-auth-pour-l-authentification.md) — la limite de débit de better-auth, comptée en base.
- [ADR 0009](0009-drizzle-pour-postgresql-migrations-hors-demarrage.md) — la migration avant le déploiement, et la vérification du schéma.
- [#127](https://github.com/Muhammed21/dezyn/issues/127) — un changement de secret casse l'émission des jetons.
