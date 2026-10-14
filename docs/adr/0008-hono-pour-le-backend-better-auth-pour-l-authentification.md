# 0008 — Hono pour le backend, better-auth pour l'authentification et le serveur OAuth du MCP

- Statut : Proposé
- Date : 2026-10-15
- Décideurs : Muhammed

## Contexte et problématique

Le backend unique sert l'API HTTP, le MCP en Streamable HTTP et un serveur d'autorisation OAuth 2.1 pour les apps d'IA (ADR 0007). Les outils MCP et les routes d'API partagent les mêmes use-cases (ADR 0007 §3).

Le dépôt suit un style fonctionnel : fonctions pures, données immuables, schémas Zod aux frontières, TDD. Le plan Free doit rester peu coûteux par utilisateur (ADR 0006).

Problématique : quel framework porte le backend, et quelle brique fournit l'authentification et le serveur OAuth du MCP ?

## Facteurs de décision

- Style fonctionnel, sans classes ni décorateurs.
- Routes typées et validées par Zod, avec les mêmes schémas que les outils MCP.
- Hébergement laissé ouvert.
- Un serveur OAuth 2.1 compatible avec les clients MCP, sans l'écrire soi-même.
- Pas de coût par utilisateur, plan Free compris (ADR 0006).

## Options envisagées

### Option A — Hono

- Avantage : léger, fondé sur les standards du web (`Request` / `Response`), style fonctionnel.
- Avantage : routes typées et validées par Zod, spec OpenAPI générée depuis les schémas (`@hono/zod-openapi`).
- Avantage : tourne sur Node, Bun ou Cloudflare Workers.
- Inconvénient : l'organisation en modules et leurs frontières sont à la charge du projet.
- **Retenue.**

### Option B — NestJS

- Avantage : modules, injection de dépendances, structure imposée, écosystème riche.
- Inconvénient : classes et décorateurs, à l'opposé du style fonctionnel du dépôt ; plus lourd.
- **Écartée.**

### Option C — Fastify

- Avantage : rapide et mûr, plugins, validation par schéma.
- Inconvénient : moins orienté standards du web que Hono, typage moins direct.
- **Écartée.**

### Option D — Express

- Avantage : cadre des exemples du SDK MCP officiel.
- Inconvénient : vieillissant, peu typé, sans validation ni OpenAPI natives.
- **Écartée.**

### Option E — better-auth

- Avantage : bibliothèque TypeScript auto-hébergée, données dans notre PostgreSQL.
- Avantage : intégration Hono documentée ; plugin qui fait de l'application un serveur OAuth 2.1 pour les clients MCP, enregistrement dynamique des clients compris.
- Avantage : aucun coût par utilisateur.
- Inconvénient : bibliothèque encore jeune pour du code critique.
- **Retenue.**

### Option F — Fournisseur externe (WorkOS AuthKit, Auth0, Clerk…)

- Avantage : sécurité déléguée à un spécialiste.
- Inconvénient : facture qui grandit avec les utilisateurs, plan Free compris ; dépendance à un tiers pour la connexion.
- **Écartée.**

### Option G — Keycloak auto-hébergé

- Avantage : complet et éprouvé.
- Inconvénient : un service Java de plus à exploiter, lourd pour le stade du projet.
- **Écartée.**

## Décision

### 1. Le backend est une application Hono

L'API HTTP et le serveur MCP Streamable HTTP sont servis par une seule application Hono (ADR 0007 §1).

### 2. Les routes sont validées par des schémas Zod

Chaque route déclare ses entrées et ses sorties par des schémas Zod. La spec OpenAPI est générée depuis ces schémas. Les outils MCP utilisent les mêmes schémas.

### 3. better-auth fournit l'authentification et le serveur OAuth 2.1

La connexion des utilisateurs et le serveur d'autorisation OAuth 2.1 du MCP passent par better-auth, auto-hébergé sur la base PostgreSQL de la plateforme. Aucun code d'OAuth n'est écrit à la main.

## Conséquences

### Positives

- Un style uniforme, fonctionnel, du use-case à la route.
- Un seul jeu de schémas pour l'API, la spec OpenAPI et les outils MCP.
- Le serveur OAuth du MCP ne coûte rien par utilisateur.

### Négatives

- Hono n'impose pas de structure : les frontières entre modules ne sont tenues que par les règles que le projet se donne.
- La sécurité de la connexion et d'OAuth dépend d'une bibliothèque encore jeune.

### Risques et mitigations

- **Frontières entre modules qui s'effacent** : une règle de lint d'architecture arrive avec le premier module du backend, comme le plugin `lint` de twitch.
- **Faille ou rupture dans better-auth** : suivi de ses versions et de ses avis de sécurité ; ses chemins passent en revue `critical`.

## Notes d'implémentation

L'application Hono vit sous `apps/`, et arrive avec son premier use-case. Les schémas Zod partagés vont dans un paquet `contracts`, créé avec le premier outil MCP.

## Liens

- [ADR 0006](0006-plans-free-et-team-mcp-complet-dans-tous-les-plans.md) — pas de coût d'authentification par utilisateur du plan Free.
- [ADR 0007](0007-un-seul-backend-api-et-mcp-streamable-http-oauth.md) — exigences : un backend, MCP Streamable HTTP, OAuth 2.1.
