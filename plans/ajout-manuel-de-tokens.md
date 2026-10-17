# Plan : Ajout manuel de tokens

**Branche** : feat/ajout-manuel-de-tokens
**Statut** : Actif
**ADR** : 0004, 0010, 0011, 0012, 0017, 0019, 0020, 0022, 0023, 0026

## Objectif

Le propriétaire et l'éditeur d'un espace ajoutent un token à un projet depuis l'interface. Le token est Validé d'emblée, il entre dans l'historique du projet et l'IA le lit par le MCP.

## Critères d'acceptation

- [ ] Un membre ajoute un token couleur, typographie, dimension ou effet, Validé d'emblée, avec une entrée `token.created` dans la même transaction.
- [ ] Un non-membre reçoit 404 ; un nom invalide ou déjà pris, une valeur mal formée, un mode manquant ou une référence invalide répondent 400 problem+json, champ par champ.
- [ ] Un token peut référencer un token validé du même type dans le même projet.
- [ ] L'IA lit les tokens validés d'un projet par le MCP, en DTCG.
- [ ] L'ajout d'un membre fait passer à Remplacée la proposition en attente sur le même nom, et la réponse la désigne (ADR 0026 §4).

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR. Pas de code de production sans test qui échoue. Lire `CLAUDE.md` et `.claude/rules/test-fixtures.md` avant d'écrire une tranche.

### Tranche 1 : un membre ajoute un token couleur à un projet à un seul mode

**Valeur** : un membre ajoute une couleur sans passer par son IA, et elle fait foi tout de suite (ADR 0012 §2).
**Chemin** : `POST /v1/projects/:id/tokens` → `can("token.create")` → use-case `addToken` (module `token`) → token Validé et entrée `token.created` dans la même transaction (ADR 0022 §4). Hors tranche : autres types, plusieurs modes, références, lecture par le MCP.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `api-design`.
**Critères d'acceptation** :

- Un propriétaire et un éditeur ajoutent un token `color` avec `$description` facultative ; la réponse renvoie le token Validé, avec un schéma de sortie conforme à l'ADR 0023.
- L'historique du projet montre `token.created` : auteur membre, sans client OAuth, valeur ajoutée en état après.
- Un non-membre reçoit 404.
- Un nom invalide au sens DTCG, un nom déjà pris dans le projet et une couleur mal formée répondent 400 problem+json avec `errors[]` qui nomme le champ.
- Si l'écriture de l'entrée d'historique échoue, le token n'est pas créé.

**RED** : test d'intégration par HTTP sur la vraie base, avec un membre authentifié ; tests unitaires de la validité du nom et de la couleur. Mutants attendus : la ligne `token.create` de `can`, le statut Validé, chaque règle de nommage.
**GREEN** : module `token` (ADR 0020), table des tokens par projet et par mode, action `token.create` accordée au propriétaire et à l'éditeur, use-case `addToken`, route.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 2 : un membre ajoute une typographie, une dimension ou un effet

**Valeur** : un membre décrit tout le design system de base, pas seulement ses couleurs.
**Chemin** : même route → validation de la valeur par type, en fonctions pures du domaine → `typography`, `dimension`, `shadow` (ADR 0010 §1).
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Une typographie exige famille, taille, graisse, interlignage et espacement des lettres.
- Une dimension exige une valeur et une unité.
- Un effet d'ombre exige couleur, décalages, flou et étalement.
- Une valeur incomplète ou mal formée répond 400 en nommant le champ fautif.

**RED** : tests unitaires de chaque validateur sur ses bornes ; un test d'intégration par type. Mutants attendus : la table des types, chaque champ obligatoire.
**GREEN** : schémas Zod d'entrée stricts par type, validateurs du domaine.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 3 : un membre donne une valeur au token dans chaque mode du projet

**Valeur** : tous les modes du projet déclarent toujours les mêmes tokens (ADR 0010 §4).
**Chemin** : même route → complétude des modes, fonction pure du domaine → une valeur par mode. Hors tranche : création des modes et des modificateurs ; un projet à plusieurs modes est préparé par une fixture.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Sur un projet clair et sombre, un ajout avec les deux valeurs réussit.
- Un ajout qui oublie un mode répond 400 en nommant le mode.
- Un mode inconnu du projet répond 400 en le nommant.
- Un projet sans modificateur accepte une seule valeur.

**RED** : tests unitaires de la complétude des modes ; test d'intégration sur un projet à deux modes. Mutants attendus : la règle des modes, le cas du mode unique.
**GREEN** : fonction de complétude, écriture d'une valeur par mode.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 4 : un token référence un autre token validé du même type

**Valeur** : un membre construit des tokens sémantiques sur des tokens de base.
**Chemin** : même route → résolution de l'alias DTCG `{…}`, fonction pure du domaine sur les tokens validés du projet.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Une référence vers un token validé du même type, dans le même projet, est acceptée.
- Une référence vers un token inexistant, non validé ou d'un autre type répond 400 avec la raison.

**RED** : tests unitaires de la résolution (existant, validé, même type) ; test d'intégration d'un token sémantique. Mutants attendus : la comparaison des types, le filtre Validé.
**GREEN** : résolution des références dans le domaine, lecture des tokens validés par le dépôt.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 5 : l'IA lit les tokens validés d'un projet par le MCP

**Valeur** : l'IA utilise aussitôt un token ajouté par un membre, comme toute donnée validée (ADR 0012 §6).
**Chemin** : outil MCP `read_tokens` → enveloppe des outils qui visent un projet (ADR 0021, 0025) → use-case `readTokens` → tokens validés en DTCG, valeurs par mode. Le plan des lots de propositions l'étend aux propositions.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `api-design`.
**Critères d'acceptation** :

- `read_tokens` renvoie les tokens validés du projet en DTCG, sans perte : type, valeur par mode, références, description.
- L'appel laisse une entrée `mcp.read_tokens` avec l'auteur et le client OAuth.
- Un utilisateur qui n'est pas membre reçoit la même erreur qu'un projet inexistant.
- Le schéma de sortie passe le garde de l'ADR 0023.

**RED** : test d'intégration par le transport MCP après un ajout par HTTP ; test d'aller-retour DTCG. Mutants attendus : le filtre Validé, la sérialisation des références.
**GREEN** : outil `read_tokens`, use-case `readTokens`, sérialisation DTCG.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 6 : l'ajout d'un membre remplace la proposition en attente sur le même nom

**Valeur** : un membre écrit sans aller rejeter d'abord la proposition de l'IA, et il sait ce qu'il a remplacé (ADR 0026 §4).
**Chemin** : use-case `addToken` → proposition Proposée sur le même nom → statut Remplacée dans son lot, dans la même transaction que le token → réponse qui désigne la proposition.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Avec une proposition en attente sur le même nom, l'ajout réussit, la proposition passe à Remplacée et la réponse la désigne.
- La proposition remplacée reste visible dans son lot et dans l'historique.
- Sans proposition en attente, la réponse ne désigne rien.

**RED** : test d'intégration avec une proposition préparée par l'outil MCP d'écriture des tokens. Mutants attendus : le filtre sur le statut Proposée, la présence de la proposition dans la réponse.
**GREEN** : appel au module des propositions depuis `addToken`, dans l'unité de travail.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

## Barrière avant PR

1. Mutation testing (skill `mutation-testing`).
2. Évaluation du refactoring (skill `refactoring`).
3. `pnpm check-types`, `pnpm lint`, `pnpm fmt:check`.
4. Vocabulaire conforme à `CONTEXT.md` : token, mode, modificateur, membre, Validée, proposition, Remplacée.

---

_Supprimer ce fichier quand le plan est terminé._
