# Plan : Socle de l'API

**Branche** : feat/socle-api
**Statut** : Actif
**ADR** : 0007, 0008, 0009, 0020

## Objectif

Une application Hono dans `apps/api` qui démarre seulement sur un schéma à jour, répond à la sonde de santé, renvoie ses erreurs au format RFC 9457 avec un identifiant de corrélation, et dont les frontières de modules sont vérifiées par le lint.

## Critères d'acceptation

- [ ] `GET /health` répond 200 quand PostgreSQL répond, 503 sinon.
- [ ] L'app refuse de démarrer, avec un message qui nomme la migration manquante, si la dernière migration attendue n'est pas appliquée.
- [ ] Toute réponse porte `x-correlation-id` : celui reçu s'il est valide, un UUID sinon.
- [ ] Toute erreur répond en `application/problem+json` avec `type`, `title`, `status`, `instance` et `correlationId` ; une erreur de validation Zod répond 400 avec `errors[]`.
- [ ] Un import interdit entre modules ou entre couches fait échouer `pnpm lint`.

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR. Pas de code de production sans test qui échoue. Lire `CLAUDE.md` et `.claude/rules/test-fixtures.md` avant d'écrire une tranche.

### Tranche 1 : la sonde de santé répond depuis une app Hono connectée à PostgreSQL

**Valeur** : l'exploitant sait si l'API tourne et atteint sa base.
**Chemin** : `GET /health` → requête `SELECT 1` avec le rôle `app` → 200 `{ status: "ok" }` ou 503. Hors tranche : vérification du schéma, format d'erreur.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- `GET /health` répond 200 sur la base de `compose.yaml`.
- `GET /health` répond 503 quand la base est injoignable, en moins de 3 s.
- `pnpm --filter @repo/api test` et `test:integration` tournent en CI.
  **RED** : test d'intégration qui démarre l'app avec `createApp({ db })` et appelle `app.request("/health")` ; second test avec une URL de base injoignable. Mutants attendus : le code 503 et le délai de connexion.
  **GREEN** : `apps/api` (package, `tsconfig`, Vitest), `createApp` Hono, pool `pg` avec délai de connexion de 2 s, route `/health`.
  **MUTATE** : skill `mutation-testing`, rapport.
  **KILL MUTANTS** : renforcer les tests sur les survivants (demander en cas de doute).
  **REFACTOR** : si utile.
  **Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 2 : l'app refuse de démarrer sur un schéma en retard

**Valeur** : un déploiement sans migration échoue tout de suite, au lieu de servir des erreurs (ADR 0009 §4).
**Chemin** : `main.ts` → `assertSchemaVersion` lit `__drizzle_migrations` → arrêt avec message, ou démarrage. Le nom attendu vient du journal Drizzle, généré au build.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Sur une base sans la dernière migration, le démarrage échoue avec « Schéma en retard : la migration <nom> n'est pas appliquée ».
- Sur une base à jour, l'app démarre.
- Le rôle `app` ne peut pas appliquer de migration (ADR 0009 §3).
- `assertRolesProvisioned` échoue avant migration si `migrator` ou `app` manque.
  **RED** : tests d'intégration de `assertSchemaVersion` sur une base de test vide puis migrée ; test unitaire de `assertRolesProvisioned` avec une liste de rôles en mémoire. Mutants attendus : la condition « dernière » migration (comparaison de hash ou de date), le `rowCount === 0`.
  **GREEN** : `packages/db` avec Drizzle et `drizzle-kit`, script de migration lancé par `migrator`, `latest-migration` généré, `assertSchemaVersion` et `assertRolesProvisioned` repris de `twitch` et adaptés à `__drizzle_migrations`.
  **MUTATE** / **KILL MUTANTS** / **REFACTOR** : comme ci-dessus.
  **Terminé quand** : critères remplis, rapport relu, commit approuvé.

### Tranche 3 : les erreurs sortent au format RFC 9457 avec un identifiant de corrélation

**Valeur** : un client (web, IA, CI) reçoit des erreurs lisibles et peut citer un identifiant que l'on retrouve dans les logs.
**Chemin** : middleware de corrélation → route → `app.onError` / `app.notFound` → `toProblem` → réponse `application/problem+json` et log structuré.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `api-design`.
**Critères d'acceptation** :

- Une route inconnue répond 404 problem+json avec `instance` égal au chemin sans la query.
- Une erreur inattendue répond 500 « Erreur interne », sans détail, et laisse un log `level: "error"` avec le `correlationId`.
- Un `x-correlation-id` reçu valide (`^[A-Za-z0-9_-]{1,64}$`) est renvoyé tel quel ; sinon un UUID est généré.
- Chaque requête laisse un log `request` avec méthode, chemin, statut, durée et `correlationId`.
  **RED** : tests via `app.request` sur une route de test qui lève une erreur, une qui échoue la validation Zod, et une route inconnue. Mutants attendus : la regex de l'identifiant, le retrait de la query, le seuil `status >= 500` du log.
  **GREEN** : `toProblem`, `requestContext` et le format de log repris de `twitch/apps/api/src/platform`, réécrits en middleware Hono.
  **MUTATE** / **KILL MUTANTS** / **REFACTOR** : comme ci-dessus.
  **Terminé quand** : critères remplis, rapport relu, commit approuvé.

### Tranche 4 : le lint refuse un import entre modules ou entre couches (exception horizontale)

**Débloque** : la tranche 1 de « Connexion de l'IA au MCP », premier module `identity` (ADR 0020).
**Valeur** : un développeur est arrêté à l'écriture quand il traverse une frontière de module ou remonte une couche.
**Chemin** : `packages/lint` → règles `module-boundaries`, `layer-dependencies`, `no-disable-architecture` → chargées par `.oxlintrc.json` → `pnpm lint` en CI.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Un fichier de `modules/a/domain` qui importe `modules/b/application` est signalé ; via `modules/b/contracts`, il ne l'est pas.
- Un fichier de `domain` qui importe `infrastructure` du même module est signalé.
- Un `oxlint-disable` sur ces règles est lui-même signalé.
- Les messages citent l'ADR 0020.
  **RED** : tests des règles sur des fixtures, repris de `twitch/packages/lint` (cas valides et invalides par règle). Mutants attendus : la table des couches autorisées, la comparaison de module.
  **GREEN** : copie des règles de `twitch`, messages adaptés, branchement dans `.oxlintrc.json`.
  **MUTATE** / **KILL MUTANTS** / **REFACTOR** : comme ci-dessus.
  **Terminé quand** : critères remplis, rapport relu, commit approuvé.

## Barrière avant PR

1. Mutation testing (skill `mutation-testing`).
2. Évaluation du refactoring (skill `refactoring`).
3. `pnpm check-types`, `pnpm lint`, `pnpm fmt:check`.
4. Vocabulaire conforme à `CONTEXT.md`.

---

_Supprimer ce fichier quand le plan est terminé._
