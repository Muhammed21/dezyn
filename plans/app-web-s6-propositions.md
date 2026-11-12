# Plan : S6, un éditeur relit les propositions de l'IA

**Story** : #208
**Branche** : feat/contracts-proposals
**Statut** : Actif

## But

Un éditeur valide ou rejette depuis l'app web une proposition écrite par l'IA, et le token validé change (ADR 0012, ADR 0013, ADR 0044).

## Ce que l'API sert

- `GET /v1/projects/:projectId/proposal-batches` : `{ batches: [{ id, intent, state, toReview }] }`, permis par `space.read`.
- `GET /v1/proposal-batches/:batchId` : `{ id, projectId, intent, state, proposals: [{ id, name, kind, status, validated, proposed }] }`.
- `POST /v1/proposals/:proposalId/validate` et `…/reject` : `{ id, name, kind, status }`, permis par `proposal.review`.
  - 404 : proposition inconnue ou hors des espaces du membre.
  - 409 « Proposition déjà relue » (`https://dezyn.dev/problems/already-reviewed`).
  - 409 « Proposition invalide » avec `errors` (`https://dezyn.dev/problems/invalid-proposal`).
- `POST /v1/proposal-batches/:batchId/validate` `{ rejected: [uuid] }` : `{ id, state: "closed", validated, rejected }`.
  - 409 « Lot ouvert ».
  - 409 « Lot invalide » avec `errors`.
  - 400 pour une proposition hors du lot.
- Le contrôle d'`Origin` couvre déjà toute écriture par cookie sur `/v1` (S2).
- `kind` vaut `create` ou `update` ; les suppressions de l'ADR 0026 arrivent avec leur propre chantier.
- `@repo/contracts` décrit les sorties de ces routes (`src/proposal/review.ts`).

## Critères d'acceptation

- [ ] Un éditeur valide une proposition et le token change.
- [ ] Une proposition déjà relue échoue en `conflict`.

## Tranches

Chaque tranche suit RED, GREEN, MUTATE, KILL MUTANTS, REFACTOR. Une PR par tranche.

### Tranche 1 : les sorties des propositions vivent dans `@repo/contracts`

**Valeur** : l'app web et l'API lisent les mêmes formes de lots et de propositions (ADR 0044 §4).
**Chemin** : `@repo/contracts` décrit les quatre sorties → les tests d'intégration de l'API valident leurs réponses avec ces schémas.
**Critères d'acceptation** :

- `ProposalBatchesOutput`, `ProposalBatchOutput`, `ReviewedProposalOutput` et `ValidatedBatchOutput` décrivent les réponses actuelles, sans changer l'API.
- `state`, `kind` et `status` sont des `openEnum` : une valeur ajoutée plus tard par le serveur est acceptée.
- Un identifiant qui n'est pas un UUID est refusé.
- Chaque schéma respecte les conventions de sortie (`checkOutputSchema`).
- Chaque route de relecture répond une forme que son schéma accepte (tests d'intégration de l'API).
- Un test de l'API vérifie que les statuts et les types de propositions du contrat suivent le domaine.

### Tranche 1 bis : les deux 409 de la relecture ont leur propre `type`

**Valeur** : le web et le MCP distinguent « déjà relue » de « invalide » sans lire le titre.
**Chemin** : `review-routes.ts` répond `https://dezyn.dev/problems/already-reviewed` et `https://dezyn.dev/problems/invalid-proposal`.

### Tranche 2 : le membre voit les lots d'un projet et les propositions d'un lot

**Valeur** : l'éditeur sait ce que l'IA propose avant de relire.
**Chemin** : nouveau module web `proposal` → lecture des lots d'un projet et d'un lot → pages (voir question 1).

### Tranche 3 : un éditeur valide ou rejette une proposition

**Valeur** : la relecture une par une, cœur de l'ADR 0012.
**Chemin** : `reviewProposal` du module `proposal` → écriture par cookie avec `Origin` → les tokens du projet sont relus.

### Tranche 4 : un éditeur valide un lot fermé en rejetant certaines propositions

Selon la question 2.

## Hors périmètre

- Relecture en masse sur plusieurs lots.
- Suppressions proposées (ADR 0026), absentes de l'API.

## Avant chaque PR

1. Stryker sur les fichiers modifiés.
2. Évaluation du refactoring.
3. `pnpm lint`, `pnpm check-types`, tests.

---

_Supprimer ce fichier quand le plan est terminé._

## Décisions

- Une section « Propositions » (les lots) sur la page des tokens, puis une page `/lots/$batchId`.
- Valider un lot entier, en rejetant certaines propositions, est la tranche 4 de S6 ; la relecture de plusieurs lots à la fois reste reportée.
- Échecs : `already_reviewed`, `invalid_proposal` (avec ses erreurs), `not_found`, `unauthenticated`, `unavailable`, `invalid_response` ; le critère « `conflict` » de #208 devient `already_reviewed`.
- L'API donne un `type` propre aux deux 409 : `https://dezyn.dev/problems/already-reviewed` et `https://dezyn.dev/problems/invalid-proposal` (visible par le MCP).
- `main.tsx` injecte `onReviewed(projectId)`, qui invalide les tokens du projet.
- Les boutons Valider et Rejeter ne dépendent pas encore de `proposal.review` : les deux rôles l'ont, l'API reste juge.
- Une proposition montre nom, type, statut, valeur proposée et valeur validée en JSON.
- Un lot montre toutes ses propositions avec leur statut ; boutons seulement sur les propositions Proposées.
- Les tests d'intégration du web écrivent les propositions par MCP (`obtainAccessToken`, `callMcp`).
- La liste des lots montre l'intention, l'état et « N à relire ».
