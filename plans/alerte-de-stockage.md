# Plan : Alerte de stockage à l'ajout d'un token

**Branche** : feat/alerte-de-stockage
**Statut** : Actif
**Issue** : #113 (spec #112)
**ADR** : 0006, 0011, 0032

## Objectif

Un propriétaire d'espace reçoit un email quand l'ajout d'un token porte son espace à 80 % de sa limite de stockage. Le compteur d'octets de chaque projet suit l'ajout d'un token et son entrée d'historique.

## Critères d'acceptation

- [ ] Après l'ajout d'un token, le compteur du projet égale la somme des tailles UTF-8 du JSON des lignes écrites : token, valeurs, références, entrée d'historique.
- [ ] Le stockage d'un espace est la somme de ses projets.
- [ ] L'ajout qui porte l'espace à 80 % envoie un email à chaque propriétaire ouvert ; un éditeur, un membre parti et un non-membre ne reçoivent rien.
- [ ] Un ajout suivant au-dessus de 80 % n'envoie rien.
- [ ] Un espace Free déjà au-dessus de 80 % et jamais alerté est alerté à son prochain ajout.
- [ ] Deux ajouts simultanés qui franchissent 80 % n'envoient qu'une alerte.
- [ ] Un échec SMTP laisse l'ajout réussir (201) et le compteur à jour.
- [ ] L'email nomme l'espace, le stockage consommé et la limite, le projet qui consomme le plus, ce qui se passe à 100 %, et en Free le plan Team.

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR. Pas de code de production sans test qui échoue. Lire `CLAUDE.md` et `.claude/rules/test-fixtures.md` avant d'écrire une tranche.

### Tranche 1 : le compteur d'un projet suit l'ajout d'un token

Tranche horizontale assumée : elle ne montre rien à l'utilisateur, mais elle se vérifie seule (le compteur égale la somme des tailles des lignes) et débloque la tranche 2, qui alerte à partir de ce compteur.

**Valeur** : la mesure dont l'alerte et la purge ont besoin existe et reste exacte sur un chemin (ADR 0032 §1 à §3).
**Chemin** : `POST /v1/projects/:id/tokens` → `addToken` → unité de travail des tokens → le writer des tokens et le writer d'historique insèrent leurs lignes avec `.returning()` → `StorageMeter` de la transaction ajoute la taille UTF-8 du JSON de chaque ligne rendue → colonne du compteur du projet. Migration : compteur du projet (défaut `0`) et `storage_alerted_at` de l'espace, avec leurs `GRANT UPDATE` pour `app`. Hors tranche : l'alerte, les propositions, la relecture, l'état Figma.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `hexagonal-architecture`.
**Critères d'acceptation** :

- La taille d'une ligne est la longueur UTF-8 de son JSON : un caractère accentué compte 2 octets.
- Après l'ajout d'un token, le compteur du projet égale la somme des tailles de ses lignes de token, de valeurs, de références et d'historique.
- Après deux ajouts, le compteur égale toujours cette somme.
- Un ajout refusé (nom déjà pris) ne change pas le compteur.

**RED** : test unitaire de la taille d'une ligne (ASCII, accents, emoji) ; test d'intégration qui ajoute des tokens par HTTP puis compare le compteur à la somme des tailles des lignes relues. Mutants attendus : l'encodage (longueur de chaîne au lieu d'octets), le signe de l'ajout, l'appel du meter oublié pour une sorte de ligne, le compteur touché par un ajout refusé.
**GREEN** : `storedSize` dans le domaine, port `StorageMeter` dans `project/contracts`, adaptateur Postgres, appels depuis le writer des tokens et le writer d'historique, migration.
**MUTATE** : skill `mutation-testing` sur les fichiers touchés, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 2 : l'ajout qui porte l'espace à 80 % prévient les propriétaires par email

**Valeur** : un propriétaire apprend que son espace approche de la limite, avant toute purge (ADR 0032 §4).
**Chemin** : `StorageMeter` de la transaction → total de l'espace et limite de son plan → règle pure « 80 % ou plus » → `UPDATE space SET storage_alerted_at … WHERE storage_alerted_at IS NULL` → l'unité de travail note l'alerte et l'envoie après le commit → mailer → un email par propriétaire ouvert, avec le nom de l'espace, le stockage consommé et la limite. Hors tranche : le reste du contenu de l'email (tranche 3), la remise à vide sous 80 % (#115).
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Le stockage d'un espace de deux projets est la somme de leurs compteurs.
- La règle d'alerte est vraie à 80 % exactement et au-dessus, fausse juste en dessous ; la limite vaut 500 Mo en Free et 20 Go en Team.
- L'ajout qui porte l'espace à 80 % envoie un email à chaque propriétaire ouvert, et à personne d'autre.
- Un ajout suivant au-dessus de 80 % n'envoie rien.
- Un espace Free déjà au-dessus de 80 % et jamais alerté est alerté à son prochain ajout.
- Deux ajouts simultanés qui franchissent 80 % n'envoient qu'une alerte.
- Un échec SMTP laisse l'ajout réussir (201), le compteur à jour, et journalise l'échec.

**RED** : tests unitaires de la règle d'alerte (bornes, plans) ; tests d'intégration avec un compteur amené près de la limite et le mailer de test. Mutants attendus : `>=` contre `>`, le seuil de 80 %, la limite par plan, la condition `IS NULL`, l'envoi avant le commit.
**GREEN** : règle d'alerte dans le domaine, mise à jour conditionnelle, lecture des propriétaires ouverts, envoi après le commit.
**MUTATE** : skill `mutation-testing` sur les fichiers touchés, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 3 : l'email dit quel projet sera purgé et comment l'éviter

**Valeur** : le propriétaire sait quel projet perdra des données et comment agir (ADR 0032 §5, ADR 0016).
**Chemin** : composition pure de l'email → projet de l'espace qui consomme le plus → texte de ce qui se passe à 100 % → en Free, la ligne du plan Team.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- L'email nomme le projet qui consomme le plus.
- L'email dit qu'à 100 % les plus anciennes images de snapshots puis l'historique sont purgés, sans blocage du MCP.
- En Free, l'email mentionne les 20 Go du plan Team ; en Team, il n'en parle pas.
- Les tailles s'écrivent en Mo ou en Go, en français.

**RED** : tests unitaires de la composition de l'email (Free, Team, projet le plus gros, unités) ; un test d'intégration sur l'email reçu. Mutants attendus : la condition Free, le choix du projet le plus gros, le passage de Mo à Go.
**GREEN** : composition de l'email dans le domaine de l'alerte.
**MUTATE** : skill `mutation-testing` sur les fichiers touchés, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

## Contrôle avant chaque PR

1. Mutation testing : skill `mutation-testing`, en local.
2. Évaluation du remaniement : skill `refactoring`.
3. Typecheck, lint et `pnpm generate` sans diff.
4. Vocabulaire : les termes suivent `CONTEXT.md`.

---

_Supprimer ce fichier quand le plan est terminé._
