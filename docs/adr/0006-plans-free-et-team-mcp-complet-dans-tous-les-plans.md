# 0006 — Plan Free à 3 projets et 500 Mo, plan Team à 34,99 €/mois et 20 Go, MCP complet dans tous les plans

- Statut : Accepté
- Date : 2026-10-14
- Décideurs : Muhammed

## Contexte et problématique

La plateforme ne paie aucun token d'IA (ADR 0002) et son MCP est gratuit (ADR 0002 §3). La monétisation n'a pas été abordée lors de la discussion du 13/10/2026 (synthèse §7).

Le coût de la plateforme est son infrastructure, en particulier le stockage de l'historique (ADR 0004) et des images de snapshots (ADR 0005).

Problématique : sur quoi portent les plans payants, sans retirer la gratuité du MCP ?

## Facteurs de décision

- Garder le MCP gratuit et complet (ADR 0002 §3).
- Une limite simple à comprendre et à appliquer.
- Maîtriser le coût de stockage du plan gratuit.

## Options envisagées

### Option A — Limite du nombre de projets, MCP complet partout

- Avantage : l'ADR 0002 reste valable.
- Avantage : la plateforme compte les projets, pas les appels MCP.
- **Retenue**, avec une limite de stockage sur le plan Free.

### Option B — Limite de projets et fonctions réservées aux plans payants

Par exemple la régression visuelle (ADR 0005) ou l'historique au-delà d'une durée.

- Inconvénient : une partie du MCP est bridée dans le plan gratuit.
- **Écartée.**

### Option C — Limite de projets et quota d'appels MCP

- Inconvénient : contredit l'ADR 0002 §3.
- **Écartée.**

## Décision

### 1. Deux plans

- **Free** : 3 projets, 500 Mo de stockage.
- **Team** : abonnement à 34,99 €/mois, projets illimités, 20 Go de stockage.

### 2. Les fonctions sont les mêmes dans les deux plans

Le MCP, l'historique (ADR 0004) et la régression visuelle (ADR 0005) sont complets dans les deux plans. Ce qui distingue les plans, ce sont leurs limites de projets et de stockage.

### 3. Le MCP n'est jamais compté

Aucun quota d'appels MCP, quel que soit le plan.

### 4. À la limite de stockage, on purge au lieu de bloquer

La règle est la même pour le Free et le Team. L'utilisateur est alerté à 80 % de sa limite. À la limite, les données de design sont toujours écrites : la plateforme supprime d'abord les plus anciennes images de snapshots, puis les plus anciennes entrées de l'historique, et prévient l'utilisateur. Le MCP n'est jamais bloqué.

## Conséquences

### Positives

- La gratuité du MCP reste un argument commercial dans tous les plans.
- Le coût de stockage d'un utilisateur est borné dans les deux plans.
- 500 Mo représentent environ 4 000 à 5 000 snapshots d'environ 100 Ko : de quoi essayer le produit sur un vrai projet avec sa CI.

### Négatives

- Le revenu repose sur un seul plan payant.
- Une équipe qui pousse des snapshots à chaque PR atteint la limite du Free en quelques semaines.
- À la limite de stockage, un utilisateur perd ses plus anciennes images de snapshots puis ses plus anciennes entrées d'historique, y compris en Team.

### Risques et mitigations

- **Un utilisateur regroupe tout dans un seul projet pour rester gratuit** : borné par la limite de stockage.
- **Purge d'une donnée encore utile** : la référence de régression en cours d'un composant (ADR 0005 §2) n'est jamais purgée.

## Notes d'implémentation

Le projet est l'unité de facturation : la création d'un projet vérifie la limite du plan. Le stockage consommé par projet est mesuré pour appliquer la limite du plan Free. Les tailles de référence sont des estimations : une image de snapshot fait 50 à 200 Ko, une entrée d'historique 1 à 2 Ko, les données de design d'un projet quelques Mo au plus. Les images forment l'essentiel du stockage.

## Liens

- [ADR 0002](0002-ia-du-client-via-mcp-sans-ia-embarquee.md) — le MCP reste gratuit dans tous les plans.
- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — l'historique est complet dans tous les plans et compte dans le stockage.
- [ADR 0005](0005-regression-visuelle-des-snapshots-envoyes-par-la-ci.md) — la régression visuelle est complète dans tous les plans ; ses images comptent dans le stockage.
- [Synthèse de la discussion du 13/10/2026](../synthese.md)
