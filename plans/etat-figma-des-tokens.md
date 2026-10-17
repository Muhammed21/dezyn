# Plan : État Figma des tokens

**Branche** : feat/etat-figma-des-tokens
**Statut** : Actif
**ADR** : 0003, 0010, 0012, 0013, 0017, 0021, 0022, 0023, 0024

## Objectif

L'IA du client déclare par le MCP l'état Figma de chaque token d'un projet. La valeur Figma d'un token divergent devient une proposition. Les membres voient l'état, sa date, son auteur et les doublons que dezyn détecte parmi les tokens validés.

## Critères d'acceptation

- [ ] L'IA déclare en un appel l'état Figma de plusieurs tokens : synchronisé, divergent, absent de Figma ou doublon dans Figma ; la déclaration s'applique sans relecture (ADR 0024 §3).
- [ ] Une déclaration invalide est refusée en entier, avec la liste des entrées en erreur.
- [ ] La valeur Figma d'un token divergent devient une proposition dans le lot ouvert de l'IA, ou dans un lot automatique.
- [ ] Les membres et l'IA lisent l'état Figma de chaque token, avec sa date et son auteur, et les doublons de dezyn.

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR. Pas de code de production sans test qui échoue. Lire `CLAUDE.md` et `.claude/rules/test-fixtures.md` avant d'écrire une tranche.

### Tranche 1 : l'IA déclare des tokens synchronisés ou absents de Figma

**Valeur** : l'équipe sait où en est Figma pour chaque token sans l'ouvrir (ADR 0024 §1).
**Chemin** : outil MCP `declare_figma_states` → enveloppe des outils qui visent un projet → `can("token.declareFigmaState")` → validation pure de la déclaration → état de chaque token remplacé, avec la date, l'utilisateur et le client OAuth → `GET /v1/projects/:id/tokens` et `read_tokens` montrent l'état. Hors tranche : divergent, doublon dans Figma, doublons de dezyn.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `api-design`.
**Critères d'acceptation** :

- Une déclaration de plusieurs tokens `synced` et `missing_in_figma` s'applique en une transaction, avec une entrée `mcp.declare_figma_states`.
- Une nouvelle déclaration remplace l'état précédent du token.
- La lecture montre l'état, la date et l'auteur ; un token jamais comparé n'a pas d'état.
- Un token inconnu du projet ou un état inconnu fait refuser toute la déclaration, avec la liste des entrées en erreur.
- L'IA d'un utilisateur qui n'est pas membre reçoit la même erreur qu'un projet inexistant.
- L'état Figma est un enum ouvert en sortie (ADR 0023).

**RED** : tests unitaires de la validation d'une déclaration ; test d'intégration par le MCP puis lecture par HTTP et par le MCP. Mutants attendus : le remplacement de l'état, la ligne `token.declareFigmaState` de `can`, le refus en entier.
**GREEN** : use-case de déclaration dans le module `token`, outil `declare_figma_states`, route de lecture des tokens d'un projet.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 2 : l'IA déclare un doublon dans Figma

**Valeur** : l'équipe sait quelles variables Figma fusionner.
**Chemin** : même outil → état `duplicate_in_figma` avec les noms des variables Figma.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Un doublon dans Figma exige au moins deux noms de variables ; sinon la déclaration est refusée.
- La lecture montre les noms des variables Figma concernées.

**RED** : tests unitaires de la règle des deux noms ; test d'intégration de la lecture. Mutants attendus : la borne de deux noms.
**GREEN** : validation et stockage des noms de variables.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 3 : un token divergent fait naître une proposition

**Valeur** : un éditeur tranche entre la valeur de dezyn et celle de Figma, en validant ou en rejetant (ADR 0024 §4).
**Chemin** : même outil → état `diverged` avec la valeur Figma dans chaque mode → use-case d'écriture partagé du module `proposal` → proposition dans le lot ouvert de l'IA dans ce projet, sinon dans un lot automatique, avec les règles de remplacement (ADR 0013 §6, §8).
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Un divergent sans valeur Figma, ou avec une valeur d'un autre type que le token, fait refuser la déclaration.
- La valeur Figma devient une proposition dans le lot ouvert, ou dans un lot automatique, dans la même transaction que l'état.
- La valeur validée continue de faire foi tant que la proposition attend (ADR 0012 §3).
- L'éditeur retrouve la proposition parmi celles du lot.
- Quand l'éditeur valide la proposition, l'état passe à synchronisé, à la date de la comparaison qui a lu cette valeur ; quand il la rejette, l'état reste divergent (ADR 0024 §4).
- Une valeur Figma identique à la dernière valeur rejetée pour ce token ne crée pas de proposition (ADR 0024 §4).

**RED** : tests unitaires de l'obligation de valeur et de son type ; tests d'intégration avec un lot ouvert puis sans lot, puis validation et rejet par l'éditeur. Mutants attendus : l'obligation de valeur, l'appel à l'écriture partagée, la date reprise à la validation, la comparaison à la dernière valeur rejetée.
**GREEN** : branche divergente du use-case de déclaration, passage à synchronisé à la validation de la proposition.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 4 : dezyn détecte les doublons d'un projet

**Valeur** : l'équipe voit les tokens qui portent la même valeur sous des noms différents.
**Chemin** : lecture des tokens d'un projet → fonction pure sur les tokens validés → doublons calculés à la lecture, jamais stockés.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Deux tokens de même type et de même valeur dans chaque mode sont signalés comme doublons.
- Une valeur identique dans un seul mode, des types différents ou un token qui référence un autre token ne sont pas signalés.
- Une proposition en attente ne crée pas de doublon.
- Un doublon disparaît dès que l'un des deux tokens change de valeur validée.
- La lecture distingue un doublon dans dezyn d'un doublon dans Figma.

**RED** : tests unitaires de la détection ; test d'intégration avec une proposition en attente. Mutants attendus : la règle « chaque mode », l'exclusion des références, le filtre Validé.
**GREEN** : fonction de détection, ajout des doublons à la lecture.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

Un token fixé par une décision validée et divergent avec Figma ne reçoit pas de proposition (ADR 0026 §9) : cette règle arrive avec la spec des décisions et de leurs tokens.

## Barrière avant PR

1. Mutation testing (skill `mutation-testing`).
2. Évaluation du refactoring (skill `refactoring`).
3. `pnpm check-types`, `pnpm lint`, `pnpm fmt:check`.
4. Vocabulaire conforme à `CONTEXT.md` : état Figma, synchronisé, divergent, absent de Figma, doublon dans Figma, doublon, proposition, lot de propositions.

---

_Supprimer ce fichier quand le plan est terminé._
