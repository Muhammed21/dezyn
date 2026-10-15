# Plan : Historique

**Branche** : feat/historique
**Statut** : Actif
**ADR** : 0004, 0015, 0016, 0019, 0020, 0021

## Objectif

Les actions des membres et les appels MCP qui visent un espace ou un projet entrent dans un historique que l'humain et l'IA relisent page par page, et que l'app ne peut ni modifier ni effacer.

## Critères d'acceptation

- [ ] Créer un projet laisse une entrée d'historique qui référence le membre auteur, sans client OAuth.
- [ ] Dès sa création, le rôle `app` ne peut ni modifier ni supprimer une entrée ; `history_maintainer` peut en supprimer.
- [ ] L'historique d'un projet se lit par pages, par l'API et par le MCP, avec un curseur stable.
- [ ] Chaque appel d'outil MCP qui vise un espace ou un projet laisse une entrée qui référence l'auteur et le client OAuth (ADR 0021 §1).

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR.

### Tranche 1 : un membre crée un projet, et l'historique du projet le montre

**Valeur** : une action humaine entre dans l'historique du projet (ADR 0004 §4).
**Chemin** : `POST /v1/spaces/:id/projects` → `can("project.create")` → use-case `createProject` → projet et entrée `project.created` dans la même transaction → `GET /v1/projects/:id/history`. La migration qui crée `history_entry` retire au rôle `app` `UPDATE` et `DELETE` (ADR 0019 §1). Hors tranche : limites de projets du plan (ADR 0006), données de design, pagination.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Le projet créé appartient à l'espace (ADR 0011 §2).
- L'historique renvoie une entrée : action `project.created`, espace, projet, auteur référencé, date, `requestId`, sans client OAuth.
- Si l'écriture de l'entrée échoue, le projet n'est pas créé.
- Connecté en `app`, un `UPDATE` et un `DELETE` sur `history_entry` échouent avec « permission denied ».

**RED** : test d'intégration création puis lecture ; test d'échec de l'entrée ; test des droits du rôle `app`. Mutants attendus : champs de l'entrée.
**GREEN** : tables `project` et `history_entry` (forme de l'ADR 0019 §4), migration avec `REVOKE`, module `history` avec un port `HistoryWriter` exposé par `contracts/`, use-case `createProject`.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 2 : le rôle `history_maintainer` peut supprimer des entrées (exception horizontale)

**Débloque** : le job de purge de l'ADR 0016.
**Valeur** : la purge pourra supprimer des entrées sans que l'app en ait le droit (ADR 0019 §2).
**Chemin** : `init-roles.sh` crée `history_maintainer` → migration `GRANT SELECT, DELETE` → `assertRolesProvisioned` étendu.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Connecté en `history_maintainer`, un `DELETE` sur `history_entry` réussit et un `UPDATE` échoue.
- La migration échoue si `history_maintainer` n'existe pas.

**RED** : tests d'intégration du rôle ; test unitaire de la liste des rôles attendus.
**GREEN** : script, migration et `.env.example` (`PG_PASSWORD_HISTORY_MAINTAINER`).
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 3 : un membre lit l'historique d'un projet page par page

**Valeur** : l'historique reste lisible quand il grossit (ADR 0004 §3).
**Chemin** : `GET /v1/projects/:id/history?cursor=` → use-case `readHistory` → requête par clé `(occurred_at, id)` → page et curseur opaque suivant.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `api-design`.
**Critères d'acceptation** :

- Une page renvoie au plus N entrées, des plus récentes aux plus anciennes, et un curseur ; la dernière page n'en renvoie pas.
- Deux entrées à la même date ne sont ni perdues ni répétées entre deux pages.
- Un curseur mal formé répond 400 problem+json.
- Un non-membre de l'espace reçoit 404.

**RED** : tests unitaires de l'encodage du curseur ; test d'intégration avec des entrées à date identique. Mutants attendus : `<` contre `<=` sur la clé, la taille de page.
**GREEN** : use-case `readHistory`, curseur base64url de `(occurred_at, id)`, inspiré de `collectByKeyset` de `twitch`.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 4 : l'IA lit l'historique d'un projet par le MCP, et cet appel entre dans l'historique

**Valeur** : l'IA relit ce qu'elle a fait pour se corriger, et l'humain voit qu'elle l'a relu (ADR 0004 §3, ADR 0021 §1).
**Chemin** : outil MCP `read_history` → enveloppe des outils qui visent un espace ou un projet → même use-case `readHistory` → entrée `mcp.read_history` avec l'auteur et le client OAuth (`onBehalfOf`).
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `api-design`.
**Critères d'acceptation** :

- `read_history` renvoie les mêmes pages que la route d'API.
- Chaque appel, réussi ou en échec, laisse une entrée qui référence l'auteur, le client OAuth, l'espace, le projet, le résultat et le `requestId`.
- Un outil dont le schéma d'entrée contient un identifiant d'espace ou de projet et qui n'est pas enveloppé fait échouer un test qui parcourt les outils enregistrés (ADR 0021, risques).
- Le champ `action` de la sortie est une énumération ouverte : le schéma de sortie accepte une action inconnue (`openEnum`, repris de `twitch/packages/contracts/src/conventions`).

**RED** : test d'intégration de `read_history` et de l'entrée écrite ; test de l'enveloppe sur un outil qui échoue ; test de garde des outils ; test du schéma avec une action inconnue. Mutants attendus : `onBehalfOf` nul contre présent, le prédicat « vise un espace ou un projet ».
**GREEN** : enveloppe des outils MCP dans `modules/history/presentation`, outil `read_history`, schéma de sortie dans `modules/history/contracts` avec `openEnum` et `extensibleUnion`.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

La pseudonymisation remplace l'auteur référencé sans toucher aux entrées (ADR 0019 §3) : elle se planifie avec la suppression de compte.

## Barrière avant PR

1. Mutation testing (skill `mutation-testing`).
2. Évaluation du refactoring (skill `refactoring`).
3. `pnpm check-types`, `pnpm lint`, `pnpm fmt:check`.
4. Vocabulaire conforme à `CONTEXT.md` : historique, membre, membre supprimé.

---

_Supprimer ce fichier quand le plan est terminé._
