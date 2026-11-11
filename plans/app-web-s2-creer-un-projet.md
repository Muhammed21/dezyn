# Plan : S2, un propriétaire crée un projet depuis l'app web, protégé du CSRF

**Branche** : une par tranche (`feat/api-cookie-write-origin`, …)
**Statut** : actif
**Story** : S2 de `plans/app-web-stories.md` ; ADR 0044 §2 et §4.

## But

Un propriétaire crée un projet depuis l'app web, par son seul cookie de session, et aucune autre origine ne peut faire écrire l'API avec ce cookie.

## Critères d'acceptation de la story

- [ ] Depuis l'origine de `WEB_URL`, une écriture par cookie est acceptée ; la même requête avec une autre `Origin`, ou sans `Origin`, reçoit 403.
- [ ] En Bearer, aucune `Origin` n'est exigée : le MCP marche comme avant.
- [ ] L'app web crée un projet et traduit chaque refus de l'API en échec typé.
- [ ] La réponse de création est validée par un contrat partagé de `@repo/contracts`.

La story annonçait un échec `conflict` : l'API n'en a pas (deux projets peuvent porter le même nom). Les échecs réels sont `not_found`, `forbidden`, `plan_required` (limite du plan Free) et le 400 d'un nom invalide.

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR et charge `tdd`, `testing`, `mutation-testing` et `refactoring` avant tout code. Ses critères sont validés avant le premier test, et chaque commit attend l'accord.

### Tranche 1 : une écriture par cookie n'est acceptée que depuis l'origine de `WEB_URL`

**Valeur** : l'app web peut écrire avec le cookie du membre, et un site tiers ne le peut pas (CSRF).
**Chemin** : `requireMember` remplace le refus en bloc des écritures par cookie (S1, tranche 1) par le contrôle de l'ADR 0044 §2 : une méthode autre que `GET`, `HEAD` ou `OPTIONS` passe si `Origin` vaut exactement `new URL(WEB_URL).origin`, sinon 403. Le Bearer n'est pas contrôlé.
**Critères** :

- une création de projet par cookie avec `Origin: <origine de WEB_URL>` reçoit 201 et crée le projet ;
- la même requête avec une autre origine (autre sous-domaine, schéma, port, préfixe trompeur) reçoit 403 et ne crée rien ;
- la même requête sans `Origin` reçoit 403 et ne crée rien ;
- en Bearer, une création sans `Origin` reçoit 201, comme avant ;
- les lectures par cookie ne sont pas concernées.
  **RED** : unitaire sur `requireMember`, intégration sur la vraie app (cookie réel, base jetable). Mutants probables : la liste des méthodes de lecture, la comparaison exacte de l'origine, l'ordre Bearer/cookie.

### Tranche 2 : le contrat de création de projet vit dans `@repo/contracts`

**Valeur** : débloque la tranche 3 ; l'app web et l'API valident la même réponse.
**Chemin** : `packages/contracts/src/project/` porte `CreateProjectInput` (le nom, de 1 à 100 caractères après `trim`) et `CreatedProjectOutput` ; `packages/contracts/src/space/` porte `PlanRequiredProblem`, que renvoient aussi les invitations. La route `POST /v1/spaces/:spaceId/projects` valide son entrée par le premier ; ses tests vérifient la réponse par les deux autres.
**Critères** : la réponse 201 et le refus « plan requis » passent les schémas importés de `@repo/contracts` ; la validation de l'entrée ne change pas (mêmes 400).
**Exception horizontale** : déplacement vérifié par les tests existants et les nouveaux tests de contrat.

### Tranche 3 : l'app web crée un projet dans un espace

**Valeur** : un propriétaire crée un projet par le cas d'usage de l'app web, contre la vraie API.
**Chemin** : module `project` de l'app web : domaine (`Project`), cas d'usage `createProject({ spaceId, name })`, port `ProjectGateway`, passerelle HTTP sur `POST /v1/spaces/:spaceId/projects` (`credentials: "include"`), validée par les contrats de la tranche 2.
**Critères** :

- un propriétaire connecté crée un projet et reçoit son identifiant et son nom ;
- un espace Free à sa limite donne `plan_required` avec la limite ;
- sans session : `unauthenticated` ; espace inconnu : `not_found` ; membre sans le droit : `forbidden` ; nom refusé par l'API : `invalid_name` ;
- réseau en échec, 5xx ou 429 : `unavailable` ; réponse hors contrat : `invalid_response`.
  **RED** : intégration contre la vraie API pour le chemin principal et la limite du plan ; unitaire avec un `fetch` simulé pour les pannes et les réponses hors contrat.

Le formulaire de création arrive avec S5, la page des projets d'un espace.

## Contrôle avant chaque PR

1. Mutation testing sur le code modifié.
2. Évaluation du refactoring.
3. Types, lint et tests au vert.
4. Vocabulaire conforme à `CONTEXT.md`.

---

_Supprimer ce fichier quand le plan est fini._
