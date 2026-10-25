# 0036 — Les rôles PostgreSQL de dezyn sont créés en SQL par le propriétaire de la base, jamais par la console ou l'API de Neon

- Statut : Proposé
- Date : 2026-10-25
- Décideurs : Muhammed

## Contexte et problématique

L'ADR 0019 met l'historique en ajout seul pour `app` : la migration `0005_history.sql` lui retire `UPDATE`, `DELETE` et `TRUNCATE` sur `history_entry`. La purge passe par `history_maintainer`, et les migrations par `migrator`, qui possède les tables.

Un rôle créé par la console ou l'API de Neon est membre de `neon_superuser`, qui contient `pg_write_all_data`. Sur la branche `production`, les trois rôles l'étaient, et `has_table_privilege('app', 'history_entry', 'UPDATE')` répondait `true` : le `REVOKE` de l'ADR 0019 n'avait aucun effet. `REVOKE neon_superuser FROM app` est refusé, même en `neondb_owner` (`permission denied to revoke role "neon_superuser"`). Seule la suppression du rôle par l'API de Neon retire cette appartenance.

Un rôle créé en SQL par `neondb_owner` n'est pas membre de `neon_superuser`. Neon en garde le mot de passe : `neonctl connection-string` le rend sans le réinitialiser.

Les noms des rôles sont figés : les migrations leur accordent leurs droits par leur nom.

Problématique : comment les rôles de dezyn obtiennent-ils exactement les droits que leur donnent les migrations, et rien de plus ?

## Facteurs de décision

- L'historique reste en ajout seul pour `app` sur toutes les branches, production comprise.
- Les noms `migrator`, `app` et `history_maintainer` ne changent pas.
- Une branche Neon qui a des données change de rôles sans perdre de ligne.
- Un rôle trop privilégié se voit avant de servir.

## Options envisagées

### Option A — Créer les rôles en SQL, en `neondb_owner`

- Avantage : aucun rôle de dezyn n'est membre de `neon_superuser`, et les droits sont ceux des migrations.
- Inconvénient : un rôle déjà créé par Neon doit être supprimé par l'API, puis recréé, avec ses objets et ses droits mis de côté entre-temps.
- **Retenue.**

### Option B — Garder les rôles de Neon et leur retirer `neon_superuser`

- Inconvénient : impossible, le `REVOKE` est refusé.
- **Écartée.**

## Décision

### 1. Les trois rôles sont créés en SQL par le propriétaire de la base

`neondb_owner` crée `migrator`, `app` et `history_maintainer` par `CREATE ROLE`, sans superutilisateur, `BYPASSRLS`, `CREATEROLE` ni appartenance à `pg_write_all_data`. Aucun rôle de dezyn n'est créé par la console ou l'API de Neon. `migrator` reçoit explicitement `CREATE` sur la base et sur `public`.

### 2. Un rôle privilégié est refusé

Le provisionnement (`provisionRoles`) refuse un rôle existant qui est superutilisateur, `BYPASSRLS`, `CREATEROLE` ou membre de `pg_write_all_data`. `inspectRoles` signale ces rôles, les objets de `public` et de `drizzle` qui n'appartiennent pas à `migrator`, et les droits de `app` sur `history_entry`.

### 3. Un rôle créé par Neon est remplacé en passant par un dépositaire

Sur une branche qui a des données, `pnpm roles:replace <branche>` remplace chaque rôle privilégié, sous le même nom :

1. un dépositaire SQL sans connexion, `<rôle>_keeper`, reçoit les objets du rôle (`REASSIGN OWNED`) et ses droits explicites ;
2. le rôle est supprimé par l'API de Neon ;
3. dans une transaction, `neondb_owner` recrée le rôle en SQL, lui rend les objets et les droits du dépositaire, puis supprime le dépositaire.

Sur la branche `production`, la commande exige `DEPLOY_ENABLED=false`, met à jour le secret GitHub `DATABASE_URL_MIGRATOR` et fait pointer Hyperdrive sur le nouveau `app`.

## Conséquences

### Positives

- `app` ne peut ni modifier ni supprimer une ligne de l'historique, sur toutes les branches.
- Une branche copiée d'une branche aux rôles SQL hérite de rôles SQL.
- Un rôle créé par erreur dans la console de Neon est refusé par le provisionnement et signalé par l'inspection.

### Négatives

- Un rôle de dezyn ne se crée plus depuis la console de Neon.
- `neondb_owner` devient membre de chaque rôle qu'il recrée, et a donc les droits de `migrator` sur les tables.
- Remplacer `app` en production coupe l'API pendant quelques secondes : 6 s sur la répétition, hors mise à jour de Hyperdrive.

### Risques et mitigations

- Un droit que la copie ne peut pas rendre est perdu sans erreur : PostgreSQL ne lève qu'un avertissement. La suppression du dépositaire échoue tant qu'il tient un droit, et annule alors la transaction ; le dépositaire garde tout.
- Un échec entre la suppression par Neon et la recréation laisse le dépositaire seul détenteur des objets et des droits. La commande s'arrête et donne la commande `restore` à relancer.
- Hyperdrive peut garder un temps ses connexions avec l'ancien mot de passe. Une sonde `/health` le mesure pendant le remplacement en production.

## Notes d'implémentation

1. `packages/db/src/provision-roles.ts` : création des rôles manquants et refus des rôles privilégiés.
2. `packages/db/src/replace-role.ts` : `entrust` et `restore`.
3. `packages/db/src/inspect-roles.ts` : l'état comparé avant et après le remplacement.
4. `scripts/env/roles-replace.sh` : la commande `pnpm roles:replace`, répétée sur une copie de `production` avant de l'y lancer.

## Liens

- [ADR 0019](0019-l-historique-est-en-ajout-seul-pour-l-app-la-purge-passe-par-un-role-dedie.md) — l'ajout seul que `neon_superuser` levait.
- [ADR 0009](0009-drizzle-pour-postgresql-migrations-hors-demarrage.md) — `migrator`, qui applique les migrations.
- [ADR 0034](0034-l-api-est-servie-par-un-worker-cloudflare.md) — Hyperdrive, par lequel `app` sert l'API.
