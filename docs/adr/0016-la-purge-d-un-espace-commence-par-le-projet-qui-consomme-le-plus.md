# 0016 — La purge d'un espace commence par le projet qui consomme le plus

- Statut : Accepté
- Date : 2026-10-15
- Décideurs : Muhammed
- Amende : ADR 0006 (§4 : à la limite de stockage d'un espace, la purge commence par le projet qui consomme le plus)

## Contexte et problématique

À la limite de stockage, la plateforme supprime d'abord les plus anciennes images de snapshots, puis les plus anciennes entrées de l'historique (ADR 0006 §4). La limite s'applique par espace, et le stockage se mesure par projet puis se cumule par espace (ADR 0011).

Un espace contient plusieurs projets, plus ou moins actifs. Un projet qui pousse un snapshot à chaque PR peut faire atteindre la limite à tout l'espace.

Décision prise lors de la séance de revue de la PR #1 du 2026-10-15.

Problématique : à la limite de stockage d'un espace, dans quel projet la purge commence-t-elle ?

## Facteurs de décision

- Un projet calme ne perd pas son historique à cause d'un autre projet de l'espace.
- La règle de l'ADR 0006 §4 reste la même à l'intérieur d'un projet.

## Options envisagées

### Option A — Purger le plus ancien de tout l'espace

- Avantage : une seule file de purge par espace, la règle de l'ADR 0006 §4 appliquée telle quelle.
- Inconvénient : un projet calme perd ses plus anciennes données parce qu'un autre projet de l'espace consomme beaucoup.
- **Écartée.**

### Option B — Purger d'abord dans le projet qui consomme le plus

- Avantage : le projet qui fait atteindre la limite est celui qui perd ses plus anciennes données.
- **Retenue.**

## Décision

### 1. La purge commence par le projet qui consomme le plus

À la limite de stockage d'un espace, la plateforme purge d'abord dans le projet de l'espace qui consomme le plus de stockage.

### 2. Dans ce projet, l'ordre de l'ADR 0006 §4 s'applique

Dans ce projet, la plateforme supprime d'abord les plus anciennes images de snapshots, puis les plus anciennes entrées de l'historique. La référence de régression en cours d'une variante n'est jamais purgée (ADR 0006, risques).

## Conséquences

### Positives

- Un projet calme garde son historique quand un autre projet de l'espace fait atteindre la limite.
- L'utilisateur sait quel projet perd des données : celui qui consomme le plus.

### Négatives

- La purge a besoin du stockage consommé par chaque projet au moment où elle s'exécute.
- Le projet le plus actif, souvent le plus important pour l'équipe, est le premier à perdre ses plus anciennes données.

### Risques et mitigations

- **Le projet qui consomme le plus n'a plus rien à purger** (il ne lui reste que des références de régression en cours et des données de design) : la purge passe au projet suivant par stockage consommé.

## Notes d'implémentation

Le stockage consommé par projet est déjà mesuré pour appliquer la limite (ADR 0006, notes d'implémentation ; ADR 0011, notes d'implémentation). La purge trie les projets de l'espace par stockage consommé, du plus grand au plus petit.

## Liens

- [ADR 0006](0006-plans-free-et-team-mcp-complet-dans-tous-les-plans.md) — l'ordre de purge à l'intérieur d'un projet (§4).
- [ADR 0011](0011-l-espace-possede-les-projets-et-porte-le-plan.md) — la limite de stockage s'applique par espace.
