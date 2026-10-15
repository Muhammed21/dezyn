# 0019 — L'historique est en ajout seul pour l'app ; la purge passe par un rôle dédié

- Statut : Accepté
- Date : 2026-10-15
- Décideurs : Muhammed

## Contexte et problématique

Chaque entrée de l'historique dit qui a agi, l'IA ou un humain, et sa date (ADR 0004 §5). La purge à la limite de stockage supprime pourtant les plus anciennes entrées (ADR 0006 §4, ADR 0016).

À la suppression d'un compte, ses entrées passent à un membre supprimé (ADR 0015 §1). Une entrée référence son auteur au lieu de recopier son nom, pour que la suppression d'un compte remplace l'auteur sans réécrire chaque entrée (ADR 0015, notes d'implémentation).

L'app se connecte à PostgreSQL avec le rôle `app` et les migrations passent par `migrator` (ADR 0009 §3 et §4).

Problématique : comment empêche-t-on l'app de modifier ou d'effacer l'historique, tout en permettant la purge ?

## Facteurs de décision

- Un bug ou une injection dans l'app ne réécrit ni n'efface l'historique.
- La purge reste possible.
- L'auteur d'une entrée distingue l'humain de l'IA qui agit pour lui.

## Options envisagées

### Option A — Droits SQL et rôle dédié

Le rôle `app` n'a que `INSERT` et `SELECT` sur les entrées. Un rôle à part, utilisé par un job séparé, purge.

- Avantage : la protection tient même si le code de l'app est fautif.
- Inconvénient : un rôle, un secret et un processus de plus.
- **Retenue.**

### Option B — Par le code seulement

Le rôle `app` a tous les droits ; seul le use-case de purge supprime des entrées, par convention et revue.

- Avantage : rien de plus à déployer.
- Inconvénient : la protection repose entièrement sur la revue.
- **Écartée.**

## Décision

### 1. Le rôle `app` ajoute et lit les entrées, sans les modifier

Sur la table des entrées de l'historique, le rôle `app` a `INSERT` et `SELECT`, ni `UPDATE` ni `DELETE`.

### 2. Un rôle `history_maintainer` purge

Le rôle `history_maintainer` a `SELECT` et `DELETE` sur les entrées. Il est utilisé uniquement par le job de purge (ADR 0016), jamais par l'app qui sert les requêtes.

### 3. La pseudonymisation ne touche pas aux entrées

Une entrée référence son auteur (ADR 0015, notes d'implémentation). La suppression d'un compte remplace l'auteur référencé par un membre supprimé ; aucune entrée n'est modifiée, et le rôle `history_maintainer` n'intervient pas.

### 4. Une entrée référence l'auteur et, s'il y a lieu, le client OAuth

Une entrée référence l'auteur qui a agi et, quand l'action vient de l'IA, le client OAuth qui a agi pour lui. Elle porte aussi le projet, l'action, l'état avant et après, et l'identifiant de corrélation de la requête.

## Conséquences

### Positives

- Une faille de l'app ne permet ni d'effacer ni de réécrire une entrée.
- La distinction humain / IA vient de l'authentification, pas d'une déclaration du client.
- Une entrée se relie aux logs de sa requête par l'identifiant de corrélation.

### Négatives

- Un rôle PostgreSQL, un secret et un job de plus à exploiter.
- L'état avant et après d'une entrée reste tel qu'écrit, même s'il contient une donnée personnelle d'un compte supprimé (point ouvert de l'ADR 0015).

### Risques et mitigations

- **Une migration oublie de restreindre les droits** : un test d'intégration se connecte avec `app` et vérifie qu'un `UPDATE` et un `DELETE` sur les entrées sont refusés.
- **Le secret de `history_maintainer` fuit** : il n'est donné qu'au job de purge, jamais à l'app.

## Notes d'implémentation

- `docker/postgres/init-roles.sh` crée `history_maintainer` à côté de `migrator` et `app` ; `assertRolesProvisioned` (repris de `twitch`) vérifie leur présence avant migration.
- Les droits sont posés par une migration : `REVOKE UPDATE, DELETE ON history_entry FROM app; GRANT SELECT, DELETE ON history_entry TO history_maintainer;`.
- Forme d'entrée inspirée de `AuditEntry` (`twitch`) : auteur, `onBehalfOf`, `action`, portée, `stateBefore`, `stateAfter`, `requestId`. Dans `twitch`, `onBehalfOf` désigne un compte de service ; ici, c'est le client OAuth de l'IA.
- La lecture paginée par curseur (ADR 0004 §3) reprend `collectByKeyset` de `twitch`, sur `(occurred_at, id)`.

## Liens

- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — l'historique et sa lecture paginée.
- [ADR 0009](0009-drizzle-pour-postgresql-migrations-hors-demarrage.md) — rôles `migrator` et `app`.
- [ADR 0015](0015-l-historique-garde-les-actions-d-un-compte-supprime-sous-un-membre-supprime.md) — la pseudonymisation par l'auteur référencé.
- [ADR 0016](0016-la-purge-d-un-espace-commence-par-le-projet-qui-consomme-le-plus.md) — la purge.
- [ADR 0018](0018-jetons-d-acces-jwt-lies-a-l-api-session-verifiee-en-base-a-chaque-appel.md) — le client OAuth vient du jeton d'accès.
