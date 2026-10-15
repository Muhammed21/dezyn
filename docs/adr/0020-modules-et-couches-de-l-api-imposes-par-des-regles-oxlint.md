# 0020 — Modules et couches de l'API imposés par des règles oxlint

- Statut : Proposé
- Date : 2026-10-15
- Décideurs : Muhammed

## Contexte et problématique

Hono ne structure pas l'application : « l'organisation en modules et leurs frontières sont à la charge du projet » (ADR 0008, option A). Les outils MCP et les routes d'API appellent les mêmes use-cases, et aucune logique métier ne vit dans la couche MCP ou HTTP (ADR 0007 §3). Le MCP doit pouvoir devenir un service séparé sans réécrire la logique (ADR 0007, risques).

Le dépôt utilise oxlint (`.oxlintrc.json`). Le projet `twitch` du même auteur impose déjà ses frontières de modules et ses couches par deux règles oxlint (`module-boundaries`, `layer-dependencies`).

Problématique : comment l'API est-elle découpée, et comment ce découpage est-il tenu dans le temps ?

## Facteurs de décision

- Une règle d'architecture vérifiée en CI plutôt qu'en revue.
- Un use-case appelé à l'identique par une route et par un outil MCP.
- Un domaine testable sans base ni framework.

## Options envisagées

### Option A — Modules et couches, tous deux lintés

- Avantage : frontières entre modules et sens des dépendances vérifiés en CI.
- Inconvénient : plus de dossiers et de fichiers pour un petit module.
- **Retenue.**

### Option B — Modules sans couches

Seules les frontières entre modules sont lintées.

- Avantage : plus léger.
- Inconvénient : rien n'empêche un domaine d'importer Drizzle ou Hono.
- **Écartée.**

### Option C — Pas de règle avant le premier module

- Avantage : rien à écrire maintenant.
- Inconvénient : le premier module fixe l'exemple sans garde-fou.
- **Écartée.**

## Décision

### 1. L'API est découpée en modules du domaine

`apps/api/src/modules/<module>/`, un module par partie du domaine (par exemple espace, projet, relecture, historique, identité).

### 2. Chaque module a cinq couches

`domain`, `application`, `infrastructure`, `presentation` et `contracts`. Les dépendances vont de `presentation` et `infrastructure` vers `application`, puis vers `domain` ; `contracts` ne dépend que de `domain`.

### 3. Un module n'importe un autre module que par son `contracts/`

Tout autre import entre modules est une erreur de lint.

### 4. Les routes HTTP et les outils MCP sont dans `presentation`

Une route et l'outil MCP équivalent appellent le même use-case de `application`.

### 5. Les règles sont vérifiées en CI

Les règles vivent dans un package du dépôt, chargé par `.oxlintrc.json`. Leur désactivation par commentaire est elle-même interdite.

## Conséquences

### Positives

- Le découpage du MCP en service séparé reste possible : la logique est dans `application` et `domain`.
- Un domaine sans dépendance d'infrastructure se teste en unitaire.
- Une violation est signalée à l'écriture, pas en revue.

### Négatives

- Un package de règles à maintenir, et à adapter quand oxlint change son API de plugins.
- Plus de fichiers par module, y compris pour un module simple.

### Risques et mitigations

- **Les règles ne voient pas un chemin d'import inattendu** (alias, réexport) : chaque règle a ses tests sur des fixtures, repris de `twitch`.
- **`contracts/` devient une porte vers tout le module** : il n'exporte que des types, des schémas Zod et des fonctions pures.

## Notes d'implémentation

Repris de `twitch` (`packages/lint`) : `module-boundaries.ts`, `layer-dependencies.ts`, `no-disable-architecture.ts`, `paths.ts`, `imports.ts`, et leurs tests. Les messages renvoient à cet ADR au lieu de l'ADR 0002 de `twitch`.

## Liens

- [ADR 0007](0007-un-seul-backend-api-et-mcp-streamable-http-oauth.md) — mêmes use-cases pour l'API et le MCP.
- [ADR 0008](0008-hono-pour-le-backend-better-auth-pour-l-authentification.md) — l'organisation en modules est à la charge du projet.
