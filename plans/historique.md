# Plan : Historique

**Branche** : feat/historique
**Statut** : Actif
**ADR** : 0004, 0015, 0019

## Objectif

Chaque action d'un membre ou de l'IA dans un projet laisse une entrée d'historique qui dit qui a agi, que l'humain et l'IA relisent page par page, et que l'app ne peut ni modifier ni effacer.

## Critères d'acceptation

- [ ] Créer un projet laisse une entrée d'historique avec le membre auteur.
- [ ] Chaque appel d'outil MCP sur un projet, lecture comme écriture, laisse une entrée avec l'utilisateur et le client OAuth.
- [ ] Le rôle `app` ne peut ni modifier ni supprimer une entrée.
- [ ] L'historique se lit par pages, par l'API et par le MCP, avec un curseur stable.

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR.

### Tranche 1 : un membre crée un projet, et l'historique du projet le montre

**Valeur** : le premier événement d'un projet est tracé, et l'humain le voit.
**Chemin** : `POST /v1/spaces/:id/projects` → `can("project.create")` → use-case `createProject` → projet et entrée `project.created` dans la même transaction → `GET /v1/projects/:id/history`. Hors tranche : limites de projets du plan (ADR 0006), données de design.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Le projet créé appartient à l'espace (ADR 0011 §2).
- L'historique renvoie une entrée : action `project.created`, auteur, date, `requestId`.
- Si l'écriture de l'entrée échoue, le projet n'est pas créé.
  **RED** : test d'intégration création puis lecture ; test d'échec de l'entrée. Mutants attendus : champs de l'entrée.
  **GREEN** : tables `project` et `history_entry` (forme reprise de `AuditEntry` de `twitch`), module `history` avec un port `HistoryWriter` exposé par `contracts/`.
  **Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 2 : l'app ne peut ni modifier ni supprimer une entrée

**Valeur** : l'historique fait foi d'audit, même face à un bug de l'app (ADR 0019 §1 et §2).
**Chemin** : `init-roles.sh` crée `history_maintainer` → migration `REVOKE`/`GRANT` → `assertRolesProvisioned` étendu.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Connecté en `app`, un `UPDATE` et un `DELETE` sur `history_entry` échouent avec « permission denied ».
- Connecté en `history_maintainer`, ils réussissent.
- La migration échoue si `history_maintainer` n'existe pas.
  **RED** : tests d'intégration par rôle ; test unitaire de la liste des rôles attendus.
  **GREEN** : script, migration et `.env.example` (`PG_PASSWORD_HISTORY_MAINTAINER`).
  **Terminé quand** : critères remplis, rapport relu, commit approuvé.

### Tranche 3 : chaque appel d'outil MCP sur un projet laisse une entrée qui nomme l'IA

**Valeur** : l'humain voit ce que l'IA a lu et écrit, et au nom de qui (ADR 0004 §1 et §5).
**Chemin** : middleware MCP → identité du jeton (`userId`, `client_id`) → outil → entrée `mcp.<outil>` avec `actorId` et `onBehalfOf`, que l'outil réussisse ou échoue.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Un appel d'outil en lecture laisse une entrée avec l'utilisateur et le client OAuth.
- Un appel en échec laisse une entrée avec le résultat « échec ».
- Une action dans l'interface laisse une entrée sans client OAuth.
  **RED** : test d'intégration d'un outil de lecture de projet (premier outil projet, minimal) et d'un appel refusé. Mutants attendus : `onBehalfOf` nul contre présent.
  **GREEN** : enveloppe des outils MCP qui écrit l'entrée.
  **Terminé quand** : critères remplis, rapport relu, commit approuvé.

### Tranche 4 : l'humain et l'IA lisent l'historique page par page

**Valeur** : l'IA relit son historique pour se corriger sans recevoir tout d'un coup (ADR 0004 §3).
**Chemin** : `GET /v1/projects/:id/history?cursor=` et outil MCP `read_history` → même use-case → requête par clé `(occurred_at, id)` → page et curseur opaque suivant.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `api-design`.
**Critères d'acceptation** :

- Une page renvoie au plus N entrées, des plus récentes aux plus anciennes, et un curseur ; la dernière page n'en renvoie pas.
- Deux entrées à la même date ne sont ni perdues ni répétées entre deux pages.
- Un curseur mal formé répond 400 problem+json.
- Un non-membre de l'espace reçoit 404.
  **RED** : tests unitaires de l'encodage du curseur ; test d'intégration avec des entrées à date identique. Mutants attendus : `<` contre `<=` sur la clé, la taille de page.
  **GREEN** : use-case `readHistory`, curseur base64url de `(occurred_at, id)`.
  **Terminé quand** : critères remplis, rapport relu, commit approuvé.

La pseudonymisation (ADR 0015) et la purge (ADR 0016) sont des jobs sous `history_maintainer` : à planifier après la suppression de compte et la mesure du stockage.

## Barrière avant PR

1. Mutation testing.
2. Évaluation du refactoring.
3. `pnpm check-types`, `pnpm lint`, `pnpm fmt:check`.
4. Vocabulaire conforme à `CONTEXT.md` : historique, membre, membre supprimé.

---

_Supprimer ce fichier quand le plan est terminé._
