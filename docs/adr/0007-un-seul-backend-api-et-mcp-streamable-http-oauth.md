# 0007 — Un seul backend qui expose l'API HTTP et le MCP en Streamable HTTP, authentifié par OAuth 2.1

- Statut : Accepté — limites des plans par utilisateur remplacées par des limites par espace dans [0011](0011-l-espace-possede-les-projets-et-porte-le-plan.md)
- Date : 2026-10-15
- Décideurs : Muhammed

## Contexte et problématique

L'IA du client (Claude, ChatGPT…) lit et écrit la base de design via le MCP de la plateforme (ADR 0002). La même base est servie au web, où l'humain consulte et valide (ADR 0001 §4), et à la CI du client, qui envoie les snapshots visuels (ADR 0005 §3).

Chaque appel MCP et chaque action humaine entrent dans un historique unique qui dit qui a agi (ADR 0004). Les plans limitent les projets et le stockage par utilisateur (ADR 0006).

Problématique : le MCP et l'API forment-ils un seul service ou deux, et comment l'IA du client s'authentifie-t-elle auprès du MCP ?

## Facteurs de décision

- Pas de logique métier en double entre le MCP et l'API.
- Un historique unique écrit au même endroit (ADR 0004).
- Compatibilité avec les apps d'IA web (claude.ai, ChatGPT), qui demandent un MCP distant.
- Chaque appel rattaché à un utilisateur identifié et révocable (ADR 0004, ADR 0006).
- Coût de déploiement et d'exploitation.

## Options envisagées

### Option A — Un seul backend qui expose l'API HTTP et le MCP

Le MCP passe par le transport Streamable HTTP du protocole, dans la même application que l'API. Le front web est à part.

- Avantage : outils MCP et API appellent les mêmes use-cases.
- Avantage : l'historique unique s'écrit au même endroit.
- Avantage : un seul service à déployer, une seule authentification.
- Inconvénient : la charge du MCP et celle de l'API se partagent les mêmes instances.
- **Retenue.**

### Option B — Deux services : une API et un serveur MCP séparé

- Avantage : mise à l'échelle séparée.
- Inconvénient : deux déploiements, une vérification des jetons partagée entre deux processus, risque de logique dupliquée.
- **Écartée.**

### Option C — Un MCP local en stdio sur le poste de l'utilisateur

- Avantage : rien à héberger côté MCP.
- Inconvénient : chaque utilisateur l'installe ; incompatible avec les apps d'IA web, qui demandent un MCP distant.
- **Écartée.**

### Option D — Authentification du MCP par OAuth 2.1

Le mécanisme prévu par la spécification MCP pour les serveurs distants : l'utilisateur clique sur « Connecter » dans son app d'IA, se connecte à la plateforme et autorise l'accès.

- Avantage : attendu par les connecteurs de claude.ai et de ChatGPT, géré par Claude Code.
- Avantage : chaque appel est rattaché à un utilisateur identifié, et l'accès est révocable.
- Inconvénient : la plateforme doit exposer un serveur d'autorisation OAuth.
- **Retenue.**

### Option E — Clé d'API personnelle

- Avantage : simple à construire.
- Inconvénient : mal ou pas gérée par les apps d'IA web ; une clé copiée fuit facilement.
- **Écartée.**

### Option F — OAuth et clé d'API personnelle

- Inconvénient : deux chemins d'authentification à sécuriser dès le départ.
- **Écartée.**

## Décision

### 1. Un seul backend

Une seule application expose l'API HTTP et le serveur MCP. Le front web est une application séparée qui appelle l'API.

### 2. Le MCP passe par Streamable HTTP

Le serveur MCP est distant et utilise le transport Streamable HTTP de la spécification MCP.

### 3. Les outils MCP appellent les mêmes use-cases que l'API

Un outil MCP et la route d'API équivalente partagent le même use-case. Aucune logique métier ne vit dans la couche MCP ou dans la couche HTTP.

### 4. L'IA du client s'authentifie par OAuth 2.1

L'accès au MCP passe par OAuth 2.1, comme le prévoit la spécification MCP. Chaque appel est rattaché à l'utilisateur qui a autorisé l'accès.

### 5. La CI garde son propre jeton

L'envoi des snapshots par la CI passe par un jeton par projet, pas par OAuth (ADR 0005 §3).

## Conséquences

### Positives

- Une seule implémentation de chaque use-case, appelée par le MCP et par l'API.
- L'historique unique (ADR 0004) et les limites des plans (ADR 0006) s'appliquent au même endroit.
- Le MCP fonctionne depuis claude.ai, ChatGPT et Claude Code.

### Négatives

- Une forte charge MCP ralentit aussi l'API et le web, puisqu'ils partagent les mêmes instances.
- La plateforme héberge un serveur d'autorisation OAuth, code sensible à maintenir.
- Deux mécanismes d'authentification coexistent : OAuth pour les utilisateurs, jeton de projet pour la CI.

### Risques et mitigations

- **Charge du MCP** : le MCP est séparé en service distinct le jour où sa charge l'exige ; la règle §3 garde ce découpage possible sans réécrire la logique.
- **Faille dans le serveur d'autorisation OAuth** : aucun code d'OAuth n'est écrit à la main, il vient de better-auth (ADR 0008).

## Notes d'implémentation

Les chemins d'authentification et de jetons relèvent du palier de revue `critical` (`.github/labeler.yml`, `REVIEW.md`).

## Liens

- [ADR 0002](0002-ia-du-client-via-mcp-sans-ia-embarquee.md) — l'IA du client passe par ce MCP.
- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — l'auteur de chaque entrée vient de l'authentification.
- [ADR 0005](0005-regression-visuelle-des-snapshots-envoyes-par-la-ci.md) — la CI utilise un jeton de projet.
- [ADR 0006](0006-plans-free-et-team-mcp-complet-dans-tous-les-plans.md) — les limites des plans s'appliquent par utilisateur authentifié.
- [ADR 0008](0008-hono-pour-le-backend-better-auth-pour-l-authentification.md) — framework et brique d'authentification.
