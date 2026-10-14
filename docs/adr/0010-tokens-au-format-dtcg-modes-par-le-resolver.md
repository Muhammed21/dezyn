# 0010 — Tokens de design au format DTCG, modes décrits par le module Resolver

- Statut : Proposé
- Date : 2026-10-15
- Décideurs : Muhammed

## Contexte et problématique

La plateforme est la source de vérité des couleurs, typographies, dimensions, effets et animations d'un projet (ADR 0001 §1). L'IA du client les y écrit via le MCP (ADR 0002), et les fait sortir vers Figma ou le code (ADR 0003). Le modèle est stocké dans PostgreSQL et décrit par un schéma Drizzle (ADR 0009).

Un même rôle prend des valeurs différentes selon le mode, par exemple clair et sombre.

Le DTCG a publié le 28/10/2025 la version stable 2025.10 de sa spécification, en trois modules : Format, Color et Resolver ([rapport 2025.10](https://www.designtokens.org/tr/2025.10/)). Le module Resolver décrit les thèmes par des ensembles (`sets`), des modificateurs (`modifiers`) à contextes, comme `light` et `dark`, et un ordre de résolution (`resolutionOrder`) ([module Resolver](https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/)).

Problématique : sur quel modèle reposent les tokens de design, et comment représenter leurs modes ?

## Facteurs de décision

- Couvrir tout le périmètre de l'ADR 0001 : couleurs, typographies, dimensions, effets, animations.
- Import et export sans perte vers les outils du secteur et vers Figma (ADR 0003).
- Un format que l'IA connaît déjà, plutôt qu'un format maison.
- Rendre explicites les liens entre tokens.
- Empêcher un mode incomplet.

## Options envisagées

### Option A — Le format DTCG du W3C comme modèle de référence

Chaque token suit la structure DTCG (`$type`, `$value`, `$description`, alias `{color.primary}`).

- Avantage : standard lu par Style Dictionary, Tokens Studio et d'autres outils.
- Avantage : ses types couvrent le périmètre de l'ADR 0001 : `color`, `dimension`, `fontFamily`, `fontWeight`, `typography`, `shadow`, `duration`, `cubicBezier`, `transition`, `border`, `gradient`.
- Avantage : les alias rendent les décisions explicites pour l'IA.
- Inconvénient : le format de base ne décrit pas les modes aussi directement que les variables Figma.
- **Retenue.**

### Option B — Un modèle propre à la plateforme, DTCG en export seulement

- Avantage : liberté totale du modèle.
- Inconvénient : une conversion à maintenir dans chaque sens ; l'IA apprend un format maison.
- **Écartée.**

### Option C — Le format Tokens Studio

- Avantage : répandu chez les designers.
- Inconvénient : propre à un outil, divergent de DTCG.
- **Écartée.**

### Option D — Le format des variables Figma

- Avantage : export direct vers Figma.
- Inconvénient : lie la plateforme à Figma, à l'opposé de l'ADR 0001.
- **Écartée.**

### Option E — Modes par le module Resolver de DTCG

Les thèmes sont décrits par des ensembles de tokens et des modificateurs (par exemple `mode` : `clair`, `sombre`).

- Avantage : standard, export sans perte vers les outils qui lisent DTCG.
- Avantage : correspond aux modes des variables Figma pour l'export.
- Inconvénient : publié en même temps que le format, il est encore peu lu par les outils.
- Inconvénient : il n'exige pas que chaque contexte déclare les mêmes tokens ; cette règle est propre à la plateforme.
- **Retenue.**

### Option F — Un ensemble par mode, aux chemins identiques

- Avantage : simple et éprouvé.
- Inconvénient : convention maison, sans description standard du thème.
- **Écartée.**

### Option G — Toutes les valeurs dans le token, sous `$extensions`

- Avantage : compact.
- Inconvénient : non standard ; les autres outils ne voient qu'une valeur, ou aucune.
- **Écartée.**

## Décision

### 1. Un token suit la structure DTCG

Chaque token de la plateforme porte un `$type` DTCG, une `$value` et une `$description`. Une référence à un autre token s'écrit en alias DTCG (`{groupe.token}`).

### 2. L'import et l'export se font en DTCG, sans perte

Un ensemble de tokens importé en DTCG puis réexporté ressort identique.

### 3. Les modes sont décrits par le module Resolver de DTCG

Les thèmes d'un projet sont des ensembles de tokens combinés par des modificateurs à contextes, dans un ordre de résolution, selon le module Resolver de la version 2025.10.

### 4. Chaque mode déclare exactement les mêmes tokens

Une écriture qui laisse un mode sans un token que les autres déclarent est refusée. Cette règle s'ajoute au module Resolver, qui ne l'exige pas.

## Conséquences

### Positives

- Un modèle que l'IA et les outils du secteur connaissent déjà.
- Le périmètre complet de l'ADR 0001 est couvert par des types standard.
- Un mode incomplet ne peut pas entrer dans la base.

### Négatives

- Le modèle relationnel (ADR 0009) doit représenter les types composites, les alias et les modificateurs de DTCG.
- La règle du §4 refuse des écritures de l'IA ; ses messages d'erreur doivent lui permettre de corriger seule.

### Risques et mitigations

- **Outils qui ne lisent pas encore le module Resolver** : mitigation à définir avec le premier export.
- **Évolution du standard DTCG** : la version suivie (2025.10) est fixée et notée dans le schéma. Le module Resolver se contredit sur la valeur de son champ `version` (`2025-10-01` dans le tableau racine, `2025-11-01` au §4.1.2) : la valeur acceptée à l'import se décide avec le premier import.

## Notes d'implémentation

Le schéma Zod d'un token DTCG vit dans le paquet `contracts`, partagé entre l'API et les outils MCP (ADR 0008 §2). Le test d'aller-retour import → export du §2 arrive avec le premier import.

## Liens

- [ADR 0001](0001-plateforme-centrale-de-design-plutot-que-pont-figma-code.md) — périmètre des données de design.
- [ADR 0003](0003-import-export-orchestres-par-les-mcp-du-client.md) — import et export vers Figma et le code.
- [ADR 0008](0008-hono-pour-le-backend-better-auth-pour-l-authentification.md) — schémas Zod partagés.
- [ADR 0009](0009-drizzle-pour-postgresql-migrations-hors-demarrage.md) — stockage en base.
