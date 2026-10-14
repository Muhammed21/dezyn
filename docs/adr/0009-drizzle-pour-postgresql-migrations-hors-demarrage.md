# 0009 — Drizzle ORM pour PostgreSQL, migrations appliquées par `migrator` hors du démarrage de l'app

- Statut : Proposé
- Date : 2026-10-15
- Décideurs : Muhammed

## Contexte et problématique

Le backend Hono (ADR 0008) lit et écrit PostgreSQL. L'infrastructure locale crée deux rôles : `migrator`, propriétaire de la base, et `app`, qui ne peut pas modifier le schéma (`docker/postgres/init-roles.sh`, `docker/tests/infra.test.sh`). better-auth stocke aussi ses tables dans cette base (ADR 0008 §3).

L'historique (ADR 0004) et le stockage consommé par projet (ADR 0006) sont tenus en base.

Problématique : comment le backend décrit-il son schéma, fait-il ses requêtes, et qui applique les migrations, quand ?

## Facteurs de décision

- Types déduits du schéma, sans étape de génération avant le lint et le typage.
- Schémas Zod dérivés du schéma de base (ADR 0008 §2).
- Adaptateur better-auth disponible.
- Migrations lisibles en revue.
- L'app tourne sans droit de modifier le schéma.
- Plusieurs instances démarrent sans se disputer une migration.

## Options envisagées

### Option A — Drizzle ORM

- Avantage : schéma en TypeScript, types déduits, pas de client à générer.
- Avantage : requêtes proches du SQL, style fonctionnel.
- Avantage : `drizzle-zod` dérive les schémas Zod ; adaptateur better-auth officiel.
- Avantage : migrations en fichiers SQL versionnés.
- Inconvénient : plus jeune que Prisma, relations moins abstraites.
- **Retenue.**

### Option B — Prisma 7

- Avantage : mûr, schéma déclaratif, migrations éprouvées.
- Inconvénient : client généré et non versionné, étape `generate` partout ; schéma dans un langage à part.
- **Écartée.**

### Option C — Kysely

- Avantage : constructeur de requêtes très bien typé.
- Inconvénient : pas de schéma déclaratif ; types et migrations à écrire ou générer à part.
- **Écartée.**

### Option D — SQL brut (`postgres.js`, `pg`)

- Avantage : contrôle total.
- Inconvénient : rien n'est typé de base, tout est à la main.
- **Écartée.**

### Option E — Migrations par une étape dédiée, vérification de version au démarrage

- Avantage : l'app garde le rôle `app`, sans droit sur le schéma.
- Avantage : pas de course entre instances.
- Avantage : une migration ratée bloque le déploiement, pas une app à moitié démarrée.
- **Retenue.**

### Option F — Migrations au démarrage de l'app

- Inconvénient : l'app a besoin des droits de `migrator` ; deux instances peuvent lancer la même migration.
- **Écartée.**

### Option G — Migrations à la main

- Inconvénient : rien d'automatisé, risque d'oubli et de décalage entre code et base.
- **Écartée.**

## Décision

### 1. Drizzle ORM décrit le schéma et porte les requêtes

Le schéma de base s'écrit en TypeScript avec Drizzle ; les types en sont déduits. Les schémas Zod des entrées et sorties qui reflètent une table sont dérivés par `drizzle-zod`. better-auth utilise l'adaptateur Drizzle.

### 2. Les migrations sont des fichiers SQL versionnés

Chaque changement de schéma produit un fichier de migration SQL, committé avec le changement du schéma TypeScript.

### 3. Une étape dédiée applique les migrations avec `migrator`

Les migrations sont appliquées par une commande dédiée, avec le rôle `migrator`, avant le déploiement de l'app. L'app n'applique jamais de migration.

### 4. L'app vérifie la version du schéma au démarrage

Au démarrage, l'app vérifie que la dernière migration attendue est appliquée, et refuse de démarrer sinon. Elle se connecte avec le rôle `app`.

## Conséquences

### Positives

- Pas d'étape de génération avant le lint, le typage et les tests.
- Un seul schéma, d'où viennent les types TypeScript et les schémas Zod.
- L'app ne peut pas modifier le schéma, même compromise.
- Une migration ratée s'arrête au déploiement.

### Négatives

- Drizzle est plus jeune que Prisma, et ses relations demandent plus de code explicite.
- Le déploiement compte une étape de plus, à lancer avant l'app ; sans elle, l'app refuse de démarrer.

### Risques et mitigations

- **Rupture dans une version de Drizzle** : version fixée dans le lockfile, montée de version dans une PR dédiée.
- **Ordre de déploiement inversé** (app avant migration) : la vérification du §4 refuse le démarrage au lieu de servir sur un schéma ancien.

## Notes d'implémentation

1. Un paquet de base de données, créé avec la première table, porte le schéma Drizzle, les migrations et la commande de migration.
2. La commande de migration lit `DATABASE_URL_MIGRATOR` ; l'app lit `DATABASE_URL` (`.env.example`).
3. Les tests d'infra (`docker/tests/infra.test.sh`) gagnent un contrôle de la migration avec le premier fichier de migration.
4. Les migrations relèvent du palier de revue `critical` (`.github/labeler.yml`).

## Liens

- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — l'historique est stocké en base.
- [ADR 0006](0006-plans-free-et-team-mcp-complet-dans-tous-les-plans.md) — le stockage par projet est mesuré en base.
- [ADR 0008](0008-hono-pour-le-backend-better-auth-pour-l-authentification.md) — backend Hono, schémas Zod, better-auth.
