# 0043 — Le Worker de purge vérifie le schéma et se déploie sans attendre le plan Workers Paid

- Statut : Accepté
- Date : 2026-11-10
- Décideurs : Muhammed Cavus
- Amende : ADR 0042 (commande locale, §2 ; droits de `history_maintainer`, §7 ; dépendance au plan Workers Paid, conséquences)

## Contexte et problématique

L'ADR 0042 place la purge de l'historique dans un Worker `dezyn-purge`, connecté en `history_maintainer`, dont le §7 fixe les droits. Le Worker de l'API vérifie la version du schéma avant de servir : il lit `drizzle.__drizzle_migrations`, que le rôle `app` peut lire depuis la migration 0000. `history_maintainer` n'a aucun droit sur le schéma `drizzle` : un Worker de purge qui vérifie le schéma comme l'API échouerait à chaque passage.

L'ADR 0042 §2 donne `pnpm --filter @repo/api purge` pour lancer un passage en local. pnpm 11 a une commande intégrée `purge`, alias de `clean`, qui passe avant le script du paquet : cette commande ne lance pas la purge.

L'ADR 0042 note que la purge consomme plus que les 10 ms de CPU par invocation du plan Workers Free, et fait attendre le Worker au plan Workers Paid (#161). Les Cron Triggers existent en Free, l'API y dépasse déjà ce plafond sans être coupée, et chaque lot de la purge est une transaction.

Problématique : comment le Worker de purge vérifie-t-il le schéma, comment se lance la purge en local, et le Worker attend-il le plan Workers Paid pour se déployer ?

## Facteurs de décision

- Ne jamais purger une base dont le schéma est en retard sur le code.
- Ne donner à `history_maintainer` que ce que la purge exige.
- Une commande documentée qui fait ce qu'elle dit.
- Ne pas laisser un espace grossir sans limite en attendant un changement de plan.

## Options envisagées

### Vérifier le schéma

#### Option A — `history_maintainer` lit la version du schéma

`USAGE` sur le schéma `drizzle` et `SELECT` sur `drizzle.__drizzle_migrations`, comme `app`.

- Avantage : le Worker de purge vérifie la base comme l'API, avant chaque passage.
- Inconvénient : un droit de plus pour `history_maintainer`, sur des métadonnées sans donnée utilisateur.

**Retenue.**

#### Option B — le Worker de purge ne vérifie pas le schéma

- Avantage : les droits de l'ADR 0042 §7 restent tels quels.
- Inconvénient : un Worker déployé sur une base en retard purge avec des requêtes qui ne correspondent pas au schéma ; seule la transaction du lot limite les dégâts.

**Écartée** : la vérification coûte un droit de lecture sur des métadonnées.

### Attendre le plan Workers Paid

#### Option C — déployer `dezyn-purge` dès maintenant

- Avantage : les espaces à leur limite sont purgés sans attendre #161.
- Inconvénient : un passage peut être coupé au plafond de CPU du plan Free.

**Retenue** : un lot coupé est annulé par sa transaction et le passage suivant reprend.

#### Option D — attendre le plan Workers Paid

- Avantage : aucun passage coupé.
- Inconvénient : rien ne purge tant que #161 n'est pas fait.

**Écartée.**

## Décision

### 1. `history_maintainer` lit la version du schéma

En plus des droits de l'ADR 0042 §7, `history_maintainer` a `USAGE` sur le schéma `drizzle` et `SELECT` sur `drizzle.__drizzle_migrations`. Le Worker `dezyn-purge` vérifie la version du schéma avant chaque passage ; une base en retard est journalisée et n'est pas purgée.

### 2. La purge se lance par `pnpm --filter @repo/api run purge`

En local et en test, `pnpm --filter @repo/api run purge` lance un passage avec `DATABASE_URL_HISTORY_MAINTAINER`.

### 3. `dezyn-purge` se déploie sans attendre le plan Workers Paid

`deploy.yml` déploie `dezyn-purge` dès que son Hyperdrive existe et que `PURGE_DEPLOY_ENABLED` vaut `true`. Le plan Workers Paid (#161) lève le plafond de CPU, sans changement de code.

## Conséquences

### Positives

- Le Worker de purge ne touche jamais une base dont le schéma est en retard.
- La commande documentée lance la purge.
- La purge tourne en production avant le changement de plan.

### Négatives

- `history_maintainer` lit les métadonnées des migrations.
- En Free, un passage peut s'interrompre avant d'avoir ramené un espace à 90 %.

### Risques et mitigations

- **Chaque passage est coupé avant la fin de son premier lot** : l'espace ne redescend pas, et `history_purge_pass` n'apparaît pas dans les logs du Worker ; le plan Workers Paid (#161) lève ce plafond.

## Notes d'implémentation

1. Migration 0016 : `GRANT USAGE ON SCHEMA drizzle` et `GRANT SELECT ON drizzle.__drizzle_migrations` à `history_maintainer`.
2. `apps/api/src/purge-worker.ts` vérifie le schéma avec `assertSchemaVersion`, comme `apps/api/src/worker.ts`.
3. À l'acceptation de cet ADR : la ligne de statut de l'ADR 0042 et sa ligne d'index dans `docs/adr/README.md` mentionnent l'amendement de son §2, de son §7 et de sa dépendance au plan Workers Paid par l'ADR 0043.

## Liens

- [ADR 0034](0034-l-api-est-servie-par-un-worker-cloudflare.md) — le Worker de l'API, qui vérifie déjà le schéma.
- [ADR 0042](0042-la-purge-de-l-historique-tourne-dans-un-worker-planifie-et-ramene-l-espace-a-90-pourcent-de-sa-limite.md) — la purge planifiée, que cet ADR amende.
