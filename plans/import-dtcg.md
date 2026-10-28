# Plan : importer un document DTCG ou Resolver dans un projet

**Issue** : #167
**Décision** : ADR 0041
**Statut** : Actif

## Objectif

Un membre importe un document DTCG ou Resolver dans un projet, en tokens validés, et ce document ressort identique de l'export.

## Critères d'acceptation

Ceux de #167, répartis par tranche ci-dessous.

## Tranches

Chaque tranche suit RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR, et fait une PR. Les critères d'une tranche sont validés avant son premier test.

### Tranche 1 : un membre importe un document DTCG simple dans un projet sans modes

**Valeur** : un membre démarre un projet à partir d'un fichier DTCG, sans ressaisir ses tokens.
**Chemin** : `POST /v1/projects/:id/tokens/import` → use-case `importTokens` → aplatissement du document imbriqué en tokens nommés → vérification de chaque token par les règles d'écriture (types, valeurs, références vers le document ou le projet, conflits de groupe) → 409 si un nom est déjà validé → écriture en une transaction, une entrée `token.created` par token, remplacement des propositions en attente du même nom → 201 `{ imported, modes }`. 400 « Document invalide » avec toutes les erreurs ; 400 au-delà de 500 tokens ; 404 pour un non-membre. Hors tranche : `$type` de groupe, propriétés non stockées, documents Resolver.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères** : à valider avant la tranche. L'ADR 0041 passe à « Accepté ».

### Tranche 2 : le `$type` d'un groupe s'hérite, et ce que dezyn ne stocke pas est refusé

**Valeur** : les fichiers qui typent leurs groupes s'importent ; rien n'est perdu en silence.
**Chemin** : aplatissement → un token sans `$type` prend celui de son groupe le plus proche → `$description` ou `$extensions` de groupe, `$deprecated` et `$root` donnent une erreur 400 avec leur chemin.
**Critères** : à valider avant la tranche.

### Tranche 3 : un document Resolver s'importe dans un projet qui a déjà les mêmes modes

**Valeur** : un projet à modes reçoit un fichier exporté d'un autre projet à modes.
**Chemin** : `importTokens` reconnaît un document Resolver → `version` `2025.10`, un seul modificateur, une source en ligne par contexte, `resolutionOrder` sur ce modificateur, pas de `sets` ni de `$ref` externe → même modificateur et même ensemble de modes que le projet → chaque token reçoit sa valeur par mode, une valeur dans chaque contexte → mêmes refus et même écriture qu'en tranche 1.
**Critères** : à valider avant la tranche.

### Tranche 4 : un document Resolver crée le modificateur et les modes d'un projet vide

**Valeur** : un projet à modes peut naître par l'API ; l'aller-retour export → import → export ressort identique avec modes.
**Chemin** : projet sans modes ni token validé → création du modificateur sous le nom du document et des modes dans l'ordre des contextes, dans la transaction de l'import → l'export échappe `~` et `/` dans le `$ref`. Un document Resolver dans un projet qui a des tokens sans modes, ou un document simple dans un projet à modes, répond 400.
**Critères** : à valider avant la tranche. La dernière PR supprime ce plan et clôt #167.
