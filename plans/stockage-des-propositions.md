# Plan : Les propositions de l'IA comptent dans le stockage

**Branche** : feat/stockage-des-propositions
**Statut** : Actif
**Issue** : #114 (spec #112)
**ADR** : 0006, 0032

## Objectif

Les propositions et les lots qu'écrit `write_tokens` comptent dans le stockage du projet, et un `write_tokens` qui porte l'espace à 80 % alerte ses propriétaires sans jamais échouer à cause de l'alerte.

## Critères d'acceptation

- [ ] Après `write_tokens`, le compteur du projet égale la somme des tailles des lignes du projet.
- [ ] Après le remplacement d'une proposition en attente, le compteur égale la somme des tailles des lignes du projet.
- [ ] Un `write_tokens` qui porte l'espace à 80 % alerte les propriétaires ouverts et réussit.
- [ ] Un `write_tokens` qui porte l'espace à 80 % réussit même si le SMTP est en panne.

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR. Pas de code de production sans test qui échoue. Lire `CLAUDE.md` et `.claude/rules/test-fixtures.md` avant d'écrire une tranche.

### Tranche 1 : le compteur suit les propositions et les lots de `write_tokens`

**Valeur** : une IA qui écrit beaucoup de propositions consomme du stockage, mesuré exactement (ADR 0032 §1 à §3).
**Chemin** : outil MCP `write_tokens` → `writeTokens` → unité de travail des propositions → le store insère les propositions et le lot avec `.returning()`, met à jour statut, état et date avec `.returning()` après avoir relu l'ancienne ligne → `StorageMeter` de la transaction ajoute les nouvelles tailles et retire les anciennes. L'entrée d'historique `mcp.write_tokens` se compte déjà dans sa propre transaction. Hors tranche : l'alerte (tranche 2), la relecture, l'intention d'un lot et l'état Figma (#115).
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Après un `write_tokens` qui crée deux propositions, le compteur égale la somme des tailles des lignes du projet : tokens, valeurs, références, propositions, lots, historique.
- Après un second `write_tokens` qui remplace une proposition en attente, le compteur égale toujours cette somme.
- Après un `write_tokens` qui clôt un lot expiré et en ouvre un autre, le compteur égale toujours cette somme.
- Un `write_tokens` refusé (token invalide) ne compte que son entrée d'historique.

**RED** : test d'intégration par le MCP, qui compare le compteur à la somme des tailles des lignes relues. Mutants attendus : le signe du retrait, une mise à jour non mesurée, l'ancienne ligne prise à la place de la nouvelle.
**GREEN** : `StorageMeter` retire une taille ; le store des propositions mesure ses insertions et ses mises à jour.
**MUTATE** : skill `mutation-testing` sur les fichiers touchés, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 2 : un `write_tokens` qui porte l'espace à 80 % prévient les propriétaires

**Valeur** : l'alerte part aussi quand c'est l'IA qui remplit l'espace, sans bloquer l'IA (ADR 0006 §4, ADR 0032 §4).
**Chemin** : unité de travail des propositions → décision d'alerte dans la transaction (`storageAlertOn`) → après le commit, `sendStorageAlert`. Hors tranche : la relecture et l'état Figma (#115).
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Un `write_tokens` qui porte l'espace à 80 % envoie un email à chaque propriétaire ouvert et réussit.
- Un `write_tokens` qui porte l'espace à 80 % réussit même si le SMTP est en panne, et journalise l'échec.
- Un `write_tokens` sans changement (tous les tokens dans `unchanged`) sur un espace déjà au-dessus de 80 % et jamais alerté alerte quand même.

**RED** : tests d'intégration par le MCP avec un compteur amené près de la limite et le mailer de test. Mutants attendus : l'envoi oublié, l'envoi avant le commit.
**GREEN** : l'unité de travail des propositions fournit la décision d'alerte ; `writeTokens` envoie après le commit.
**MUTATE** : skill `mutation-testing` sur les fichiers touchés, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

## Contrôle avant la PR

1. Mutation testing : skill `mutation-testing`, en local.
2. Évaluation du remaniement : skill `refactoring`.
3. Typecheck, lint et `pnpm generate` sans diff.
4. Vocabulaire : les termes suivent `CONTEXT.md`.

---

_Supprimer ce fichier quand le plan est terminé._
