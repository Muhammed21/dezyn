# Plan : Lots de propositions

**Branche** : feat/lots-de-propositions
**Statut** : Actif
**ADR** : 0004, 0007, 0010, 0012, 0013, 0017, 0021, 0022, 0023, 0025, 0026

## Objectif

Toute écriture de l'IA sur un token est une proposition, rangée dans un lot de propositions qui porte son intention. Un éditeur la relit et la valide ou la rejette, une par une ou par lot fermé. Tant qu'elle attend, la valeur validée fait foi.

## Critères d'acceptation

- [ ] Une écriture de l'IA crée une proposition Proposée qui ne fait pas foi ; l'IA ne lit par défaut que les données validées.
- [ ] Une écriture identique à la valeur validée ne crée rien ; une nouvelle écriture ou le retour à la valeur validée remplace la proposition en attente (ADR 0013 §5, §6, §8).
- [ ] L'IA ouvre et ferme un lot avec son intention ; sans lot ouvert, un lot s'ouvre automatiquement ; un lot se ferme après 30 minutes sans écriture.
- [ ] Un éditeur valide ou rejette une proposition, et valide en entier un lot fermé, en rejetant certaines propositions.
- [ ] Chaque écriture de l'IA, ouverture, fermeture, validation et rejet entre dans l'historique du projet.

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR. Pas de code de production sans test qui échoue. Lire `CLAUDE.md` et `.claude/rules/test-fixtures.md` avant d'écrire une tranche.

### Tranche 1 : l'IA propose la création d'un token

**Valeur** : une écriture de l'IA ne casse plus le design system : elle attend une relecture (ADR 0012 §1, §3).
**Chemin** : outil MCP `write_tokens` → enveloppe des outils qui visent un projet → use-case d'écriture partagé (module `proposal`) → lot ouvert automatiquement pour l'acteur dans le projet → proposition de création Proposée → réponse avec le lot et le statut obtenu. Hors tranche : modification, remplacement, ouverture et fermeture explicites, relecture.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `api-design`.
**Critères d'acceptation** :

- Une écriture sans lot ouvert crée un lot automatique, sans intention, et une proposition de création Proposée.
- La réponse désigne le lot et le statut `proposed`, avec un schéma de sortie conforme à l'ADR 0023 (statut et état de lot en enums ouverts).
- `read_tokens` ne renvoie pas le token proposé.
- L'appel laisse une entrée `mcp.write_tokens` avec l'auteur et le client OAuth.
- L'IA d'un utilisateur qui n'est pas membre de l'espace reçoit la même erreur qu'un projet inexistant.

**RED** : test d'intégration par le transport MCP avec un jeton d'accès, puis lecture par `read_tokens`. Mutants attendus : le statut initial, le filtre Validé de la lecture, la recherche du lot ouvert de l'acteur.
**GREEN** : module `proposal` (ADR 0020), agrégat lot de propositions (ADR 0022 §5), tables du lot et des propositions, outil `write_tokens`.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 2 : l'éditeur valide ou rejette une proposition

**Valeur** : l'éditeur fait entrer une écriture de l'IA dans le design system, ou l'écarte.
**Chemin** : `GET /v1/projects/:id/proposal-batches`, `GET /v1/proposal-batches/:id` → `POST /v1/proposals/:id/validate` ou `/reject` → `can("proposal.review")` → transition pure → valeur validée du token, statut et entrée d'historique dans la même transaction.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `api-design`.
**Critères d'acceptation** :

- La liste des lots d'un projet donne pour chacun son intention, son état et son nombre de propositions à relire.
- Un lot montre, pour chaque proposition, la valeur validée actuelle et la valeur proposée.
- Valider fait de la valeur proposée la valeur validée ; rejeter laisse la valeur validée en place.
- Une proposition Validée, Rejetée ou Remplacée ne se relit plus : 409 problem+json.
- Le propriétaire et l'éditeur relisent ; un non-membre reçoit 404.
- Chaque validation et chaque rejet laissent une entrée avec l'éditeur.

**RED** : tests unitaires des transitions d'une proposition ; test d'intégration écriture par le MCP puis relecture par HTTP. Mutants attendus : chaque transition interdite, la ligne `proposal.review` de `can`.
**GREEN** : action `proposal.review` accordée au propriétaire et à l'éditeur, routes de lecture et de relecture.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 3 : l'IA propose une modification, et une écriture identique ne crée rien

**Valeur** : l'IA corrige un token validé, sans encombrer la relecture de ce qui ne change pas (ADR 0013 §5).
**Chemin** : use-case d'écriture partagé → comparaison à la valeur validée, fonction pure → proposition de modification, ou rien.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Une valeur différente de la valeur validée crée une proposition de modification.
- Une valeur identique, sans proposition en attente, ne crée rien, et la réponse le dit.
- Une proposition doit donner une valeur dans chaque mode du projet ; un mode manquant est refusé en le nommant (ADR 0010 §4).

**RED** : tests unitaires de la comparaison, mode par mode ; test d'intégration d'une écriture identique. Mutants attendus : la comparaison, le statut renvoyé quand rien n'est créé.
**GREEN** : comparaison à la valeur validée, réutilisation de la complétude des modes du module `token`.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 4 : une nouvelle écriture remplace la proposition en attente

**Valeur** : un token a au plus une proposition à relire, et l'IA annule sa propre erreur (ADR 0013 §6, §8).
**Chemin** : use-case d'écriture partagé → proposition en attente sur le même token, dans n'importe quel lot → Remplacée, dans la même transaction.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Une nouvelle valeur remplace la proposition en attente, même dans un autre lot, et en crée une nouvelle.
- Le retour à la valeur validée remplace la proposition en attente sans en créer de nouvelle.
- La réponse dit si l'écriture a créé, remplacé ou rien créé.

**RED** : tests d'intégration du remplacement entre deux lots et du retour à la valeur validée. Mutants attendus : le filtre « encore Proposée », la création après remplacement.
**GREEN** : remplacement dans le use-case d'écriture, exposé au module `token` pour l'ajout manuel (ADR 0026 §4).
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 5 : l'IA ouvre et ferme un lot avec son intention

**Valeur** : l'éditeur sait pourquoi un lot existe, et un import reste un seul lot (ADR 0013 §1-3).
**Chemin** : outils MCP `open_proposal_batch` et `close_proposal_batch` → lot de l'acteur dans le projet.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Ouvrir un lot avec une intention ; les écritures suivantes y vont ; le fermer.
- Ouvrir un lot alors qu'un lot est ouvert pour cet acteur dans ce projet ferme le précédent.
- Le lot continue après une reconnexion au MCP.
- Des écritures dans deux projets produisent deux lots.
- L'ouverture et la fermeture entrent dans l'historique.

**RED** : tests unitaires des transitions d'un lot ; tests d'intégration de la reconnexion et des deux projets. Mutants attendus : la clé acteur et projet du lot ouvert, la fermeture du précédent.
**GREEN** : outils d'ouverture et de fermeture, transitions du lot.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 6 : un lot se ferme après 30 minutes sans écriture

**Valeur** : un lot oublié par l'IA devient validable en entier (ADR 0013 §7).
**Chemin** : lecture ou écriture suivante → fonction pure « lot expiré » sur la date de la dernière écriture et l'instant du port `Clock` → lot fermé. Sans tâche planifiée.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- À 30 minutes moins un instant, le lot est ouvert ; à 30 minutes, il est fermé.
- La fermeture est constatée à la lecture comme à l'écriture ; une écriture après expiration ouvre un nouveau lot automatique.

**RED** : tests unitaires à la borne exacte ; test d'intégration avec un `Clock` contrôlé. Mutants attendus : `<` contre `<=` sur la borne, la durée.
**GREEN** : fonction d'expiration, constat dans la lecture et l'écriture.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 7 : l'éditeur valide un lot fermé en entier

**Valeur** : un import se relit en une fois, sans valider à l'aveugle ce qui arrive pendant la relecture (ADR 0013 §4, §9).
**Chemin** : `POST /v1/proposal-batches/:id/validate` avec les propositions rejetées → garde « lot fermé » → validation des propositions encore Proposées, rejet des autres désignées, dans une transaction.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `api-design`.
**Critères d'acceptation** :

- Valider un lot ouvert répond 409 problem+json.
- Valider un lot fermé valide toutes ses propositions encore Proposées, sauf celles rejetées dans le même appel.
- Une proposition Remplacée pendant la relecture n'est pas validée.

**RED** : test d'intégration avec un lot fermé, un rejet et un remplacement en cours de relecture. Mutants attendus : la garde « lot fermé », le filtre « encore Proposée ».
**GREEN** : use-case de validation d'un lot, route.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 8 : l'IA lit les propositions quand elle le demande

**Valeur** : l'IA reprend un import qui n'est pas encore relu (ADR 0012 §6).
**Chemin** : `read_tokens` avec un paramètre explicite → tokens validés et propositions avec leur statut et leur lot.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `api-design`.
**Critères d'acceptation** :

- Sans le paramètre, la lecture ne change pas : données validées seules.
- Avec le paramètre, chaque token montre aussi sa proposition en attente, son statut et son lot.

**RED** : test d'intégration par le MCP avec et sans le paramètre. Mutants attendus : la valeur par défaut du paramètre.
**GREEN** : paramètre d'entrée strict de `read_tokens`, requête de lecture dédiée.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

## Barrière avant PR

1. Mutation testing (skill `mutation-testing`).
2. Évaluation du refactoring (skill `refactoring`).
3. `pnpm check-types`, `pnpm lint`, `pnpm fmt:check`.
4. Vocabulaire conforme à `CONTEXT.md` : proposition (`proposal`), lot de propositions (`proposalBatch`), intention (`intent`), Proposée, Validée, Rejetée, Remplacée.

---

_Supprimer ce fichier quand le plan est terminé._
