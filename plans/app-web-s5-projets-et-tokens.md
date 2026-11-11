# Plan : S5, le membre parcourt les projets d'un espace et leurs tokens

**Branche** : une par tranche
**Statut** : actif
**Story** : S5 de `plans/app-web-stories.md`, [#207](https://github.com/Muhammed21/dezyn.dev/issues/207) ; ADR 0044 §4 et §6.

## But

Depuis l'app web, un membre ouvre un espace, voit ses projets et en crée un, puis ouvre un projet et lit ses tokens.

## Critères d'acceptation de la story

- [ ] La liste des projets d'un espace porte `historyPurgedAt` ; un espace dont le membre n'est pas membre répond `not_found`.
- [ ] Les tokens d'un projet se lisent avec leurs modes ; un projet d'un espace dont le membre n'est pas membre répond `not_found`.
- [ ] Un propriétaire crée un projet depuis la page de l'espace, et le voit dans la liste.
- [ ] `ProjectsOutput` et `TokensOutput` vivent dans `@repo/contracts`, validés par l'API et par l'app web.

Reporté : l'export et l'import (story à venir), les propositions de l'IA (S6), l'état Figma des tokens (chantier visuel).

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR et charge `tdd`, `testing`, `mutation-testing` et `refactoring` avant tout code. Ses critères sont validés avant le premier test, et chaque commit attend l'accord.

### Tranche 1 : le contrat de la liste des projets vit dans `@repo/contracts`

**Valeur** : débloque la tranche 2.
**Chemin** : `ProjectsOutput` passe de `apps/api/src/modules/project/contracts/projects.ts` à `packages/contracts/src/project/projects.ts`, avec ses tests ; l'outil MCP `list_projects` et les tests de l'API l'importent de `@repo/contracts`.
**Exception horizontale** : déplacement vérifié par les tests existants, déplacés avec lui.

### Tranche 2 : l'app web liste les projets d'un espace

**Valeur** : le cas d'usage de la page de l'espace, prouvé contre la vraie API.
**Chemin** : `listProjects({ spaceId })` dans le module `project` de l'app web, sur `GET /v1/spaces/:spaceId/projects`, validé par `ProjectsOutput`.
**Critères** : chaque projet avec son nom, sa date de création et `historyPurgedAt` ; `not_found` pour un espace inconnu, un espace d'un autre membre ou un identifiant qui n'est pas un UUID ; `unauthenticated`, `unavailable`, `invalid_response`.

### Tranche 3 : la page brute d'un espace liste ses projets et en crée un

**Valeur** : le membre voit ses projets dans le navigateur ; le propriétaire en crée un.
**Chemin** : route `/espaces/$spaceId` (TanStack Router), chaque espace de `/` y mène ; formulaire de création branché sur `createProject` de S2, avec un message par échec.
**Critères** : tests navigateur (Vitest Browser Mode) sur la liste, la liste vide, la création qui ajoute le projet, `plan_required` et les autres échecs, et la redirection vers `/connexion` sans session.

### Tranche 4 : le contrat des tokens d'un projet vit dans `@repo/contracts`

**Valeur** : débloque la tranche 5.
**Chemin** : `TokensOutput` et ses sous-schémas passent dans `packages/contracts/src/token/tokens.ts` ; l'outil MCP `read_tokens` et les tests de l'API l'importent de `@repo/contracts`.
**Exception horizontale** : comme la tranche 1.

### Tranche 5 : l'app web lit les tokens d'un projet

**Valeur** : le cas d'usage de la page du projet, prouvé contre la vraie API.
**Chemin** : module `token` de l'app web, `readTokens({ projectId })` sur `GET /v1/projects/:projectId/tokens`, validé par `TokensOutput`, traduit vers le modèle de l'app web.
**Critères** : les modes du projet et chaque token avec son nom, son type, sa valeur ou ses valeurs par mode, et sa description ; un type inconnu de l'app reste lisible (`unknown`) ; `not_found`, `unauthenticated`, `unavailable`, `invalid_response`.

### Tranche 6 : la page brute d'un projet liste ses tokens

**Valeur** : le membre lit les tokens d'un projet dans le navigateur.
**Chemin** : route `/projets/$projectId`, chaque projet de la page de l'espace y mène.
**Critères** : tests navigateur sur la liste, le projet sans token, un token à modes, l'échec et la redirection vers `/connexion`.

## Contrôle avant chaque PR

1. Mutation testing sur le code modifié.
2. Évaluation du refactoring.
3. Types, lint et tests au vert.
4. Vocabulaire conforme à `CONTEXT.md`.

---

_Supprimer ce fichier quand le plan est fini._
