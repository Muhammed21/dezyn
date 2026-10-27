# Plan : exporter les tokens d'un projet en DTCG

**Issue** : #164
**Décision** : ADR 0039
**Statut** : Actif

## Objectif

Un membre et l'IA du client exportent les tokens validés d'un projet en un document DTCG, ou Resolver pour un projet à modes, où ce qui a été écrit ressort identique.

## Critères d'acceptation

Ceux de #164, répartis par tranche ci-dessous.

## Tranches

Chaque tranche suit RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR, et fait une PR. Les critères d'une tranche sont validés avant son premier test.

### Tranche 1 : un membre ne peut pas ajouter un token dont le nom est en conflit de groupe

**Branche** : feat/conflit-de-nom-ajout
**Valeur** : un membre apprend, en ajoutant le token, qu'un nom ne peut pas être à la fois un token et un groupe ; l'export pourra imbriquer sans perte.
**Chemin** : `POST /v1/projects/:id/tokens` → `addToken` → règle pure du domaine `nameConflict(name, autresNoms)` → refus 400 problem+json sur `name`, avant toute écriture. Les autres noms sont les tokens validés et les propositions en attente du projet.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Ajouter `couleur` quand `couleur.fond` est validé répond 400, avec une erreur sur `name` qui nomme `couleur.fond`, sans token créé.
- Ajouter `couleur.fond.primaire` quand `couleur` est validé répond 400, avec une erreur qui nomme `couleur`.
- Même refus quand l'autre token est une proposition en attente, et la proposition reste en attente.
- `couleur.fondu` à côté de `couleur.fond` est accepté : seul un groupe entier compte, pas un début de segment.
- Un nom identique à une proposition en attente la remplace toujours (ADR 0026) : ce n'est pas un conflit de groupe.
- L'ADR 0039 passe à « Accepté ».

**RED** : tests unitaires de `nameConflict` (préfixe de groupe dans les deux sens, début de segment, nom identique, plusieurs conflits : le premier dans l'ordre des noms) ; tests d'intégration par HTTP. Mutants attendus : la concaténation du point dans le préfixe, `startsWith` contre `includes`, le sens de la comparaison.
**GREEN** : `nameConflict` dans `token/domain/token-name.ts` ; `addToken` lit les noms des tokens validés et des propositions en attente, et refuse avant d'écrire.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 2 : `write_tokens` refuse un nom en conflit de groupe

**Valeur** : l'IA du client apprend le conflit au moment d'écrire, avec le token en cause.
**Chemin** : `write_tokens` → `checkTokens` → `nameConflict` contre les tokens validés, les propositions en attente et le reste du lot → erreur d'outil qui nomme le token et l'autre nom, sans lot.
**Critères** : à valider avant la tranche.

### Tranche 3 : la validation d'une proposition en conflit est refusée

**Valeur** : deux propositions en conflit ne deviennent jamais deux tokens validés.
**Chemin** : validation d'une proposition → `nameConflict` contre les tokens validés, token par token dans l'ordre du lot → refus qui nomme l'autre token.
**Critères** : à valider avant la tranche.

### Tranche 4 : un membre exporte un projet sans modes en document DTCG

**Valeur** : les tokens d'un projet sortent vers le code et les outils DTCG.
**Chemin** : `GET /v1/projects/:id/tokens/export` → use-case `exportTokens` → document imbriqué par groupes ; 409 si deux tokens validés sont déjà en conflit ; 404 pour un non-membre.
**Critères** : à valider avant la tranche.

### Tranche 5 : un projet à modes s'exporte en document Resolver

**Valeur** : les modes d'un projet sortent sans perte.
**Chemin** : `exportTokens` → document Resolver, `version` à `2025.10` (ADR 0040), un contexte par mode.
**Critères** : à valider avant la tranche.

### Tranche 6 : l'IA exporte par `export_tokens`

**Valeur** : l'IA du client écrit les tokens dans le code.
**Chemin** : outil MCP `export_tokens` → `exportTokens` → même document que la route ; l'appel entre dans l'historique.
**Critères** : à valider avant la tranche.

## Barrière avant PR

1. Mutation testing, rapport relu.
2. Évaluation du refactoring.
3. Typage, lint, tests unitaires, tests d'intégration des modules `token` et `proposal`.
4. Vocabulaire : « token », « groupe », « proposition », « validé » (`CONTEXT.md`).

---

_Supprimer ce fichier quand le plan est terminé._
