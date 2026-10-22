# Plan : La relecture et l'état Figma comptent, la baisse réarme l'alerte

**Branche** : feat/stockage-relecture-et-figma
**Statut** : Actif
**Issue** : #115 (spec #112)
**ADR** : 0032

## Objectif

Le compteur d'un projet suit tous ses chemins d'écriture, et une écriture qui laisse l'espace sous 80 % réarme l'alerte.

## Critères d'acceptation

- [ ] Après la validation d'un lot, le rejet d'une proposition et `declare_figma_states`, le compteur du projet égale la somme des tailles des lignes du projet.
- [ ] Le remplacement d'un token retire la taille de ses anciennes lignes : le compteur égale la somme des tailles, et la taille des lignes de tokens baisse quand la nouvelle définition est plus petite.
- [ ] Un remplacement qui repasse sous 80 %, puis une écriture qui remonte au-dessus, envoient une nouvelle alerte.

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR. Pas de code de production sans test qui échoue. Lire `CLAUDE.md` et `.claude/rules/test-fixtures.md` avant d'écrire une tranche.

### Tranche 1 : le compteur suit la relecture des propositions

**Valeur** : valider ou rejeter des propositions garde la mesure exacte, et un remplacement plus petit libère du stockage (ADR 0032 §1 à §3).
**Chemin** : `POST` de validation ou de rejet → unité de travail de la relecture → statut de la proposition (mise à jour relue avant et rendue après), token créé ou remplacé (valeurs et références relues puis supprimées, nouvelle description et extensions) → `StorageMeter` de la transaction. L'entrée d'historique garde l'ancienne définition, donc le compteur du projet grandit même quand le token rapetisse. Hors tranche : `declare_figma_states` (tranche 2), le réarmement (tranche 3).
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Après la validation d'un lot qui crée un token et en remplace un autre, le compteur égale la somme des tailles des lignes du projet.
- Après le rejet d'une proposition, le compteur égale cette somme.
- Le remplacement d'un token par une définition plus petite fait baisser la taille de ses lignes de tokens, et le compteur égale toujours la somme.
- Le remplacement d'un champ qui référence un token par une valeur en dur retire la référence, et le compteur égale toujours la somme.

**RED** : tests d'intégration par HTTP et MCP qui comparent le compteur à la somme des tailles des lignes relues. Mutants attendus : la suppression non mesurée, les références oubliées, l'ancienne taille non retirée.
**GREEN** : le writer des tokens mesure le remplacement ; la relecture mesure le statut.
**MUTATE** : skill `mutation-testing` sur les fichiers touchés, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 2 : le compteur suit `declare_figma_states`

**Valeur** : la déclaration des états Figma par le plugin compte dans le stockage (ADR 0032 §1).
**Chemin** : outil MCP `declare_figma_states` → unité de travail Figma → upsert des états (anciens états relus, nouveaux rendus) → `StorageMeter`. La relecture d'une proposition de divergence met à jour l'état Figma du token par le synchroniseur, mesuré lui aussi. Les propositions de divergence se mesurent déjà par le store des propositions.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Après une première déclaration, le compteur égale la somme des tailles des lignes du projet.
- Après une seconde déclaration qui change l'état d'un token déjà déclaré, le compteur égale toujours cette somme.
- Après la validation et le rejet d'une proposition de divergence, le compteur égale toujours cette somme.

**RED** : tests d'intégration par le MCP. Mutants attendus : l'ancien état non retiré, l'upsert non mesuré.
**GREEN** : le writer des états Figma relit les anciens états et mesure l'upsert ; le synchroniseur mesure ses mises à jour.
**MUTATE** : skill `mutation-testing` sur les fichiers touchés, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 3 : une écriture sous 80 % réarme l'alerte

**Valeur** : un propriétaire qui a libéré de la place est prévenu de nouveau si l'espace remonte à 80 % (ADR 0032 §4).
**Chemin** : décision d'alerte dans la transaction → sous 80 %, `storage_alerted_at` revient à vide ; la relecture et `declare_figma_states` décident aussi de l'alerte et l'envoient après le commit.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Une écriture qui laisse l'espace sous 80 % remet `storage_alerted_at` à vide.
- Un remplacement qui repasse sous 80 %, puis une écriture qui remonte au-dessus, envoient une nouvelle alerte.
- Une validation de proposition qui porte l'espace à 80 % alerte les propriétaires et réussit.
- Un `declare_figma_states` qui porte l'espace à 80 % alerte les propriétaires et réussit.

**RED** : tests d'intégration avec un compteur amené près de la limite et le mailer de test. Mutants attendus : la remise à vide oubliée, l'envoi oublié sur un chemin.
**GREEN** : la décision d'alerte remet la date à vide sous le seuil ; les unités de travail de la relecture et de Figma fournissent la décision.
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
