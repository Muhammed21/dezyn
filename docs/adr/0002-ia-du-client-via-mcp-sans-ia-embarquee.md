# 0002 — L'IA du client lit et écrit via le MCP de la plateforme, sans IA embarquée

- Statut : Proposé
- Date : 2026-10-14
- Décideurs : Muhammed

## Contexte et problématique

La plateforme (ADR 0001) doit être remplie et consultée par une IA. Les utilisateurs disposent déjà d'une IA (Claude, ChatGPT…) avec leur propre licence, et l'outil expose déjà un serveur MCP (L15, L27, L31).

Le positionnement est « AI‑first » : le service est rendu à une IA, mais l'utilisateur reste humain et vient sur la plateforme pour regarder (L31).

Problématique : qui exécute l'IA qui alimente et interroge la plateforme, et qui paie ses tokens ?

## Facteurs de décision

- Coût d'IA pour la plateforme (L27, L31).
- Liberté pour l'utilisateur de travailler depuis son app d'IA préférée, à l'écrit ou à la voix (L23).

## Options envisagées

### Option A — IA embarquée dans la plateforme

La plateforme appelle elle-même un modèle pour générer et ranger le design.

- Inconvénient : la plateforme paie chaque token consommé.
- Inconvénient : l'utilisateur quitte son app d'IA habituelle.
- **Écartée** : contraire au « zéro coût d'IA » (L27, L31).

### Option B — L'IA du client via le MCP de la plateforme

La plateforme livre un serveur MCP ; l'IA du client s'y connecte pour lire et écrire.

- Avantage : zéro coût d'IA pour la plateforme, le client consomme ses propres tokens (L27, L31).
- Avantage : onboarding depuis l'app d'IA de l'utilisateur (L23).
- Inconvénient : la qualité du résultat dépend de l'IA du client.
- **Retenue.**

## Décision

### 1. Aucun appel de modèle d'IA côté plateforme

La plateforme n'exécute pas de LLM. Toute génération ou écriture de design vient de l'IA du client.

### 2. Le MCP est l'interface d'écriture et de lecture de l'IA

L'IA du client lit et écrit la base de connaissances design exclusivement via le serveur MCP de la plateforme.

### 3. Le MCP est gratuit

L'accès au MCP de la plateforme n'est pas payant (L31).

### 4. L'humain consulte via l'interface visuelle

L'interface web sert à regarder et valider ; le travail de production est fait par l'IA (L31).

## Conséquences

### Positives

- Coût d'IA nul pour la plateforme (L27, L31).
- Compatible avec toute IA qui parle MCP.

### Négatives

- La plateforme ne contrôle ni le modèle ni le prompt : une IA faible ou mal guidée écrit de mauvaises données.
- Le MCP gratuit ne génère pas de revenu ; les revenus viennent du plan Team (ADR 0006).

### Risques et mitigations

- **Hallucinations écrites dans la base** : mitigé par la relecture humaine (ADR 0001 §4) et par le journal des appels qui permet à l'IA de comparer la demande et ce qu'elle a fait (ADR 0004).

## Notes d'implémentation

Le serveur MCP existant est le point de départ. Ses outils couvrent la lecture et l'écriture des couleurs, typos, composants et décisions design.

## Liens

- [ADR 0001](0001-plateforme-centrale-de-design-plutot-que-pont-figma-code.md) — la plateforme que l'IA alimente.
- [ADR 0003](0003-import-export-orchestres-par-les-mcp-du-client.md) — l'IA du client combine ce MCP avec d'autres.
- [ADR 0006](0006-plans-free-et-team-mcp-complet-dans-tous-les-plans.md) — le MCP reste gratuit dans tous les plans.
- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — chaque appel à ce MCP est journalisé.
- [Synthèse de la discussion du 13/10/2026](../synthese.md)
