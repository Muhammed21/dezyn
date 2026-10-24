# Plan : un merge sur main déploie l'API sur api.dezyn.app

**Branche** : feat/worker-production
**Issue** : #129 (spec #128, ADR 0034)
**Statut** : Actif

## But

Le Worker `dezyn-api` sert toute l'API sur `api.dezyn.app`, et un merge sur `main` dont la CI est verte le déploie, vérifie `/health`, et revient à la version précédente si la vérification échoue.

## Constats de l'essai sur workerd

Un Worker jetable, lancé par `wrangler dev` 4.152.0 contre la Postgres locale (Hyperdrive en mode local), a joué : `/health`, l'inscription, la connexion, l'autorisation OAuth complète (login, consentement, jeton, refresh), `tools/list` du MCP et `GET /v1/spaces`. Tout répond comme sur Node, avec trois écarts :

1. **Un pool `pg` ne survit pas à sa requête.** Workers refuse qu'une requête utilise une connexion ouverte par une autre. La base, et donc `buildApi`, se construisent à chaque requête ; la base se ferme avec `ctx.waitUntil` à la fin de la requête. Hyperdrive tient le vrai pool : ouvrir une connexion par requête est son usage prévu.
2. **Fermer la base journalise « postgres connection lost »** à chaque requête : la fermeture voulue passe par le même événement qu'une coupure.
3. **`@repo/db` calcule le dossier des migrations au chargement** (`new URL("../migrations", import.meta.url)`), ce qui fait échouer le démarrage du Worker. Le Worker ne migre jamais : le calcul doit se faire dans `migrate`, pas au chargement du module.

## Critères d'acceptation

- [ ] Le Worker, lancé dans workerd sur une base jetable migrée, répond 200 à `/health`.
- [ ] Le Worker dans workerd sert une autorisation OAuth complète, puis un appel MCP et `GET /v1/spaces` avec le jeton obtenu.
- [ ] Une configuration manquante ou invalide fait répondre 500 au format problème, et journalise la liste des variables en cause.
- [ ] Un schéma en retard fait répondre 503 et journalise la migration manquante.
- [ ] La vérification du schéma ne tourne qu'une fois par isolat après un succès ; après un échec, la requête suivante la refait.
- [ ] Les logs du Worker sont des lignes JSON écrites avec `console.log`, `correlationId` compris.
- [ ] Fermer la base à la fin d'une requête ne journalise pas de coupure.
- [ ] Une invitation répond 503, et l'email est journalisé.
- [ ] `main.ts` et les tests d'intégration existants ne changent pas de comportement.
- [ ] `deploy.yml` : sur la CI de `main` verte, il migre, puis `wrangler deploy`, puis appelle `GET https://api.dezyn.app/health` ; s'il n'obtient pas 200, il lance `wrangler rollback` et échoue.

Les deux derniers points du déploiement se vérifient au premier merge, une fois les ressources créées.

## Étapes

Une seule PR. Chaque étape suit RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR.

### 1. Le Worker répond à /health dans workerd

- **RED** : un test d'intégration démarre `src/worker.ts` dans workerd avec `unstable_startWorker` de wrangler. Hyperdrive y pointe sur une base jetable migrée (`withThrowawayDatabase`). Il attend 200 sur `/health`.
- **GREEN** : `wrangler` en devDependency, `apps/api/wrangler.jsonc` (`dezyn-api`, `nodejs_compat`, binding `HYPERDRIVE`, domaine `api.dezyn.app`, Workers Logs) et `src/worker.ts`. Chaque requête construit sa base et `buildApi`, puis la ferme avec `ctx.waitUntil`. `migrate` calcule son dossier à l'appel.

### 2. Le flux OAuth et le MCP passent par le Worker

- **RED** : le même harnais joue `obtainAccessToken`, `callMcp` et `GET /v1/spaces` contre l'URL du Worker. `src/testing/` gagne un `App` qui envoie les requêtes par `node:http`, parce que le `fetch` de Node retire l'en-tête `cookie`.
- **GREEN** : ce que l'étape 1 a construit devrait suffire. Sinon, corriger ce que le test révèle.

### 3. La configuration du Worker est validée à la frontière

- **RED** (unitaire) : le handler, appelé avec des bindings sans `BETTER_AUTH_SECRET` ou avec un `WEB_URL` invalide, répond 500 au format problème et journalise chaque variable en cause.
- **GREEN** : un schéma zod des bindings, sur le modèle de `readApiConfig`, sans `PORT` ni SMTP. `TRUSTED_IP_HEADER` vaut `cf-connecting-ip` par défaut.

### 4. Le schéma est vérifié une fois par isolat

- **RED** (unitaire) : avec une vérification simulée, deux requêtes n'en lancent qu'une. Une vérification en échec fait répondre 503 et journalise la migration manquante, et la requête suivante la relance.
- **GREEN** : un handler construit par une fabrique qui garde le succès de `assertSchemaVersion`.

### 5. Logs et fermeture de la base

- **RED** : les lignes du Worker sont celles de `createJsonLineSink` ; fermer la base après une requête ne journalise rien (intégration, sur `createPostgresDatabase`).
- **GREEN** : `createJsonLineSink` avec `console.log` ; `createPostgresDatabase` ignore les erreurs des clients après `close`.

### 6. Une invitation répond 503 en production

- **RED** : avec le mailer du Worker, une invitation répond 503 et le log contient le destinataire et le sujet.
- **GREEN** : un mailer qui journalise et renvoie `mail_unavailable`.

### 7. Le déploiement au merge

- `.github/workflows/deploy.yml` : `workflow_run` de la CI, sur `main`, en succès. Environnement `production`, concurrence sans annulation. Il installe, migre avec `DATABASE_URL_MIGRATOR`, lance `wrangler deploy`, vérifie `/health` avec quelques essais, et lance `wrangler rollback` en cas d'échec.
- `release.yml` et `docs/ARCHITECTURE.md` décrivent l'hébergement.

## Points tranchés

- **Le cache de Hyperdrive** : désactivé (`--caching-disabled`), tranché le 2026-10-24. Le réglage ira dans le guide (#133).

## Barrière avant la PR

1. Stryker sur `src/worker.ts`, `src/platform/postgres-database.ts` et les fichiers touchés.
2. Évaluation du refactoring.
3. Typecheck, oxlint, unitaires, intégration.

---

_Supprimer ce fichier quand le plan est terminé._
