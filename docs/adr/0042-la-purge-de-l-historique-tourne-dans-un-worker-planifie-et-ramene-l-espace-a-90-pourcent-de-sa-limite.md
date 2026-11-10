# 0042 — La purge de l'historique tourne dans un Worker planifié et ramène l'espace à 90 % de sa limite

- Statut : Accepté
- Date : 2026-11-10
- Décideurs : Muhammed Cavus
- Amende : ADR 0019 (droits du rôle `history_maintainer`, §2)

## Contexte et problématique

À la limite de stockage, la plateforme purge au lieu de bloquer : d'abord les plus anciennes images de snapshots, puis les plus anciennes entrées de l'historique, en commençant par le projet de l'espace qui consomme le plus (ADR 0006 §4, ADR 0016). Seul un rôle `history_maintainer`, utilisé par un job séparé et jamais par l'app, supprime des entrées (ADR 0019 §2). Chaque chemin qui écrit ou supprime les données d'un projet tient son compteur d'octets (ADR 0032 §3).

Les snapshots (ADR 0005) n'ont pas encore de code : le stockage compte aujourd'hui les tokens, leurs valeurs et leurs états Figma, les propositions et les lots, et l'historique. Chaque appel MCP qui vise un projet laisse une entrée (ADR 0021). Le rôle `history_maintainer` a `SELECT` et `DELETE` sur `history_entry`, rien d'autre. L'API tourne dans un Worker Cloudflare relié à PostgreSQL par Hyperdrive avec les identifiants du rôle `app` (ADR 0034). Aucun job planifié n'existe.

L'issue #32 fixe les destinataires de l'alerte de purge : un email à chaque propriétaire ouvert, un bandeau dans l'interface pour les éditeurs.

Décision prise lors d'une séance de questions du 2026-11-10.

Problématique : quand, où et jusqu'où la purge de l'historique s'exécute-t-elle, et quelle trace laisse-t-elle ?

## Facteurs de décision

- Le secret de `history_maintainer` n'est jamais donné à l'app qui sert les requêtes (ADR 0019).
- Une écriture n'est jamais bloquée par la limite (ADR 0006 §4).
- Un propriétaire ne reçoit pas un email à chaque passage du job.
- La suppression d'entrées et la baisse du compteur ne divergent pas.
- L'IA et l'interface savent que l'historique d'un projet est incomplet.

## Options envisagées

### Quand purger : snapshots d'abord ou historique seul

#### Option A — Attendre les snapshots

- Avantage : la purge naît avec l'ordre complet de l'ADR 0006 §4.
- Inconvénient : bloque la purge et l'alerte de #32 sur une fonctionnalité qui n'a pas d'issue, alors que l'historique grossit déjà.
- **Écartée.**

#### Option B — L'historique seul, maintenant

- Avantage : purge ce qui grossit aujourd'hui ; les snapshots s'ajoutent devant l'historique avec leur fonctionnalité, sans changer l'ordre.
- **Retenue.**

### Ce qui déclenche la purge

#### Option A — Un Worker séparé, déclenché par un Cron Trigger

- Avantage : seul ce Worker détient le secret ; les Cron Triggers existent sur tous les plans Workers.
- Inconvénient : un espace dépasse sa limite jusqu'au passage suivant.
- **Retenue.**

#### Option B — Une file Cloudflare Queues alimentée par l'app

- Avantage : la purge suit le dépassement presque aussitôt.
- Inconvénient : demande le plan Workers Paid et une brique de plus, pour un délai que l'ADR 0006 n'exige pas.
- **Écartée.**

#### Option C — Un job planifié hors de Cloudflare (GitHub Actions)

- Inconvénient : le secret de production sort vers GitHub, et chaque passage consomme des minutes de CI.
- **Écartée.**

### Jusqu'où la purge descend

#### Option A — Juste sous la limite

- Inconvénient : un espace actif repasse la limite en quelques minutes ; ses propriétaires reçoivent un email de purge à presque chaque passage.
- **Écartée.**

#### Option B — Sous 80 %

- Inconvénient : réarme l'alerte à 80 % (ADR 0032 §4), qui repart au franchissement suivant, et supprime beaucoup d'historique d'un coup.
- **Écartée.**

#### Option C — 90 % de la limite

- Avantage : 10 % de marge avant la purge suivante (50 Mo en Free, 2 Go en Team), l'alerte à 80 % ne se réarme pas, et seul le nécessaire est supprimé.
- **Retenue.**

### Comment la purge tient le compteur

#### Option A — Des droits par colonne au rôle `history_maintainer`

- Avantage : suppression et baisse du compteur dans une même transaction, un seul secret.
- **Retenue.**

#### Option B — Deux connexions, `history_maintainer` pour supprimer et `app` pour le compteur

- Inconvénient : le job détient les deux secrets, et le compteur diverge si la seconde transaction échoue.
- **Écartée.**

### La trace de la purge

#### Option A — Une entrée `history.purged` dans l'historique du projet

- Inconvénient : une entrée référence un auteur membre ; il faudrait un auteur « plateforme », un droit `INSERT` de plus, et l'entrée serait purgée à son tour.
- **Écartée.**

#### Option B — Deux colonnes sur le projet

- Avantage : la trace survit aux purges suivantes, sans faux auteur.
- **Retenue.**

## Décision

### 1. La purge supprime l'historique seul, en attendant les snapshots

Dans le projet qu'elle purge, la plateforme supprime les plus anciennes entrées de l'historique. La purge des images de snapshots se place devant celle de l'historique quand les snapshots existeront (ADR 0006 §4).

### 2. Un Worker `dezyn-purge` passe toutes les 15 minutes

Un Worker à part, `dezyn-purge`, est déclenché par un Cron Trigger toutes les 15 minutes. Il se connecte à PostgreSQL par sa propre configuration Hyperdrive, avec les identifiants de `history_maintainer`, qu'aucun autre Worker ne détient. Les previews n'ont pas de cron. En local et en test, une commande `pnpm --filter @repo/api purge` lance un passage avec `DATABASE_URL_HISTORY_MAINTAINER`.

### 3. La purge ramène l'espace à 90 % de sa limite

Un espace dont le stockage atteint sa limite est purgé jusqu'à 90 % de celle-ci. La purge commence par le projet qui consomme le plus, puis passe au suivant quand un projet n'a plus d'entrée (ADR 0016). Quand plus aucun projet n'a d'entrée, elle s'arrête au-dessus de 90 % : il ne reste que des données de design, qui ne se purgent pas.

### 4. Par lots de 500, dans un budget de temps, sous un verrou par espace

La purge supprime 500 entrées par transaction, de la plus ancienne à la plus récente. Chaque transaction retire leur taille du compteur du projet et met à jour sa trace (§6). Un passage s'arrête après un budget de 30 secondes ; le passage suivant reprend.

Chaque lot commence par `pg_try_advisory_xact_lock` sur l'espace, puis relit dans la même transaction le stockage de l'espace et les plus anciennes entrées du projet à purger. Un lot dont le verrou est pris par un autre passage s'arrête, et le passage saute l'espace. Le verrou suit la transaction, pas la connexion : Hyperdrive mutualise les connexions par transaction et ne garde pas un verrou de session d'une transaction à l'autre.

### 5. Un email par espace et par passage qui supprime

Après un passage qui a supprimé des entrées d'un espace, chaque propriétaire ouvert de cet espace reçoit un email, un seul, en français. Il donne le nom de l'espace ; pour chaque projet purgé, le nombre d'entrées supprimées et la date de la plus récente ; le stockage après la purge et la limite ; en Free, les 20 Go du plan Team. Un échec d'envoi est journalisé, sans nouvel essai, et ne défait pas la purge.

### 6. Le projet porte la trace de sa purge

Le projet a deux colonnes : `history_purged_before`, la date de la plus récente entrée purgée, et `history_purged_at`, la date de la dernière purge. L'historique d'un projet (`GET /v1/projects/{id}/history` et `read_history`) renvoie `purgedBefore`, et le projet renvoie `historyPurgedAt`. Le bandeau des éditeurs (#32) lit ces champs ; sa durée d'affichage se décide avec l'app web.

### 7. Les droits de `history_maintainer`

En plus de `SELECT` et `DELETE` sur `history_entry` (ADR 0019 §2), le rôle `history_maintainer` a :

- `SELECT` sur `space` et `project`, pour trouver les espaces au-dessus de leur limite et ordonner leurs projets ;
- `UPDATE (stored_bytes, history_purged_before, history_purged_at)` sur `project` ;
- `SELECT` sur `space_member` et `SELECT (id, email, name)` sur `identity_user`, pour écrire aux propriétaires.

Il n'a aucun droit d'écriture sur `space` : la purge s'arrête à 90 %, au-dessus du seuil d'alerte, et ne réarme jamais `storage_alerted_at`.

## Conséquences

### Positives

- Le secret de `history_maintainer` reste hors de l'app qui sert les requêtes.
- Un espace actif est purgé par paliers de 10 %, pas à chaque passage, et ses propriétaires ne reçoivent qu'un email par purge.
- Le compteur de stockage d'un projet suit exactement ce que la purge supprime.
- L'IA et l'interface savent jusqu'à quelle date l'historique d'un projet a été supprimé.

### Négatives

- Un espace peut dépasser sa limite jusqu'à 15 minutes, et plus longtemps quand un passage n'a pas fini de redescendre à 90 %.
- Un Worker, une configuration Hyperdrive et un secret de plus à déployer et à exploiter.
- Le rôle `history_maintainer` lit les adresses email des propriétaires.
- La purge consomme plus que les 10 ms de CPU par requête du plan Workers Free : `dezyn-purge` suppose le plan Workers Paid (#161).

### Risques et mitigations

- **Un espace se remplit plus vite que la purge ne le vide** (en Team, redescendre de 2 Go demande plus d'un million d'entrées) : chaque passage reprend où le précédent s'est arrêté ; le budget de 30 secondes se règle si les mesures le demandent.
- **Deux passages se chevauchent** : chaque lot prend le verrou consultatif de l'espace pour sa transaction ; le passage qui ne l'obtient pas saute l'espace. Un verrou ne survit jamais à sa transaction, donc un passage interrompu ne bloque pas les suivants.
- **Une purge vide tout l'historique d'un projet sans ramener l'espace à 90 %** : elle passe au projet suivant, puis s'arrête ; seules restent les données de design.
- **L'email de purge échoue** : la purge reste faite, la trace du projet la montre.

## Notes d'implémentation

1. Migration : colonnes `history_purged_before` et `history_purged_at` sur `project`, droits du §7.
2. Cas d'usage de purge dans le module history : lecture des espaces au-dessus de leur limite, tri des projets par `stored_bytes`, suppression par lots avec le compteur et la trace, verrou consultatif de transaction par lot et budget. Commande `pnpm --filter @repo/api purge`.
3. Email aux propriétaires après un passage qui supprime.
4. Exposition de `purgedBefore` dans l'historique et de `historyPurgedAt` sur le projet.
5. Worker `dezyn-purge` : configuration Wrangler à part, Cron Trigger `*/15 * * * *`, Hyperdrive sur `history_maintainer`, commande de déclenchement manuel dans le runbook d'hébergement. Attend le plan Workers Paid (#161).
6. À l'acceptation de cet ADR : la ligne de statut de l'ADR 0019 et sa ligne d'index dans `docs/adr/README.md` mentionnent l'extension de son §2 par l'ADR 0042.
7. Le Worker `dezyn-purge` vérifie la version du schéma avant de purger, comme l'API : `history_maintainer` a `USAGE` sur le schéma `drizzle` et `SELECT` sur `drizzle.__drizzle_migrations`, des métadonnées sans donnée utilisateur (migration 0016). Le script se lance par `pnpm --filter @repo/api run purge` : pnpm 11 réserve `purge` à sa commande intégrée.

## Liens

- [ADR 0005](0005-regression-visuelle-des-snapshots-envoyes-par-la-ci.md) — les snapshots, purgés avant l'historique quand ils existeront.
- [ADR 0006](0006-plans-free-et-team-mcp-complet-dans-tous-les-plans.md) — purger au lieu de bloquer, et l'ordre de purge (§4).
- [ADR 0016](0016-la-purge-d-un-espace-commence-par-le-projet-qui-consomme-le-plus.md) — le projet qui consomme le plus est purgé en premier.
- [ADR 0019](0019-l-historique-est-en-ajout-seul-pour-l-app-la-purge-passe-par-un-role-dedie.md) — le rôle `history_maintainer`, dont cet ADR étend les droits.
- [ADR 0021](0021-seuls-les-appels-mcp-qui-visent-un-espace-ou-un-projet-entrent-dans-l-historique.md) — ce qui fait grossir l'historique.
- [ADR 0032](0032-le-stockage-d-un-projet-se-compte-par-un-compteur-d-octets-tenu-a-chaque-ecriture.md) — le compteur de stockage et l'alerte à 80 %.
- [ADR 0034](0034-l-api-est-servie-par-un-worker-cloudflare.md) — l'API dans un Worker Cloudflare relié par Hyperdrive.
