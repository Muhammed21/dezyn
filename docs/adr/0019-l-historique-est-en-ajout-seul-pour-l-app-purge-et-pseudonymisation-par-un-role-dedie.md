# 0019 — L'historique est en ajout seul pour l'app ; purge et pseudonymisation passent par un rôle dédié

- Statut : Proposé
- Date : 2026-10-15
- Décideurs : Muhammed

## Contexte et problématique

L'historique sert d'audit (ADR 0004 §5) : chaque entrée dit qui a agi, l'IA ou un humain. Il doit pourtant changer dans deux cas : la purge à la limite de stockage (ADR 0006 §4, ADR 0016) et la pseudonymisation des entrées d'un compte supprimé (ADR 0015 §1).

L'app se connecte à PostgreSQL avec le rôle `app` et les migrations passent par `migrator` (ADR 0009 §3 et §4).

Problématique : comment empêche-t-on l'app de modifier l'historique, tout en permettant la purge et la pseudonymisation ?

## Facteurs de décision

- Un bug ou une injection dans l'app ne réécrit pas l'historique.
- La purge et la pseudonymisation restent possibles.
- L'auteur d'une entrée distingue l'humain de l'IA qui agit pour lui.

## Options envisagées

### Option A — Droits SQL et rôle dédié

Le rôle `app` n'a que `INSERT` et `SELECT` sur l'historique. Un rôle à part, utilisé par un job séparé, purge et pseudonymise.

- Avantage : la protection tient même si le code de l'app est fautif.
- Inconvénient : un rôle, un secret et un processus de plus.
- **Retenue.**

### Option B — Par le code seulement

Le rôle `app` a tous les droits ; seuls les use-cases de purge et de pseudonymisation modifient l'historique, par convention et revue.

- Avantage : rien de plus à déployer.
- Inconvénient : la protection repose entièrement sur la revue.
- **Écartée.**

## Décision

### 1. Le rôle `app` ajoute et lit l'historique, sans le modifier

Sur la table de l'historique, le rôle `app` a `INSERT` et `SELECT`, ni `UPDATE` ni `DELETE`.

### 2. Un rôle `history_maintainer` purge et pseudonymise

Le rôle `history_maintainer` a `SELECT`, `UPDATE` et `DELETE` sur l'historique. Il est utilisé uniquement par le job de purge (ADR 0016) et le job de pseudonymisation (ADR 0015), jamais par l'app qui sert les requêtes.

### 3. Une entrée nomme l'acteur et, s'il y a lieu, le client OAuth

Une entrée porte l'utilisateur qui a agi et, quand l'action vient de l'IA, le client OAuth qui a agi pour lui. Elle porte aussi le projet, l'action, l'état avant et après, et l'identifiant de corrélation de la requête.

## Conséquences

### Positives

- Une faille de l'app ne permet ni d'effacer ni de réécrire l'historique.
- La distinction humain / IA vient de l'authentification, pas d'une déclaration du client.
- Une entrée se relie aux logs de sa requête par l'identifiant de corrélation.

### Négatives

- Un rôle PostgreSQL, un secret et un job de plus à exploiter.
- Une correction manuelle d'une entrée passe par ce rôle, pas par l'app.

### Risques et mitigations

- **Une migration oublie de restreindre les droits** : un test d'intégration se connecte avec `app` et vérifie qu'un `UPDATE` et un `DELETE` sur l'historique sont refusés.
- **Le secret de `history_maintainer` fuit** : il n'est donné qu'aux jobs, jamais à l'app.

## Notes d'implémentation

- `docker/postgres/init-roles.sh` crée `history_maintainer` à côté de `migrator` et `app` ; `assertRolesProvisioned` (repris de `twitch`) vérifie leur présence avant migration.
- Les droits sont posés par une migration : `REVOKE UPDATE, DELETE ON history_entry FROM app; GRANT SELECT, UPDATE, DELETE ON history_entry TO history_maintainer;`.
- Forme d'entrée reprise de `AuditEntry` (`twitch`) : `actorId`, `onBehalfOf`, `action`, portée, `stateBefore`, `stateAfter`, `requestId`.
- La lecture paginée par curseur (ADR 0004 §3) reprend `collectByKeyset` de `twitch`, sur `(occurred_at, id)`.

## Liens

- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — l'historique et sa lecture paginée.
- [ADR 0009](0009-drizzle-pour-postgresql-migrations-hors-demarrage.md) — rôles `migrator` et `app`.
- [ADR 0015](0015-l-historique-garde-les-actions-d-un-compte-supprime-sous-un-membre-supprime.md) — la pseudonymisation.
- [ADR 0016](0016-la-purge-d-un-espace-commence-par-le-projet-qui-consomme-le-plus.md) — la purge.
- [ADR 0018](0018-jetons-d-acces-jwt-a-audience-session-verifiee-en-base-a-chaque-appel.md) — le client OAuth vient du jeton d'accès.
