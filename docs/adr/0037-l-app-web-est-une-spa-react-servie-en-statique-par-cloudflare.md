# 0037 — L'app web est une SPA React servie en statique par Cloudflare

- Statut : Accepté
- Date : 2026-10-26
- Décideurs : Muhammed Cavus

## Contexte et problématique

dezyn n'a pas encore d'app web. Le scope `web` existe dans commitlint, et l'API connaît déjà son adresse (`WEB_URL=https://dezyn.dev`), qu'elle utilise dans les liens des emails.

L'app web sert les membres connectés : leurs espaces, leurs projets, leurs tokens, la relecture des propositions de l'IA (ADR 0012) et les invitations. Elle ne contient pas de pages publiques à référencer.

L'API est un Worker Cloudflare (ADR 0034). Le 26/10/2026, sur le plan Workers Free, un `POST /login` a consommé 181 ms de CPU et un `GET /login` 103 ms, pour un plafond affiché de 10 ms. L'API doit donc passer au plan Workers Paid. Héberger aussi le frontend a fait envisager un VPS qui servirait à la fois l'API et l'app web.

Deux stacks ont été envisagées : TanStack Start, avec rendu serveur et fonctions serveur, et une SPA React.

Problématique : quelle stack pour l'app web, et où la servir ?

## Facteurs de décision

- L'app web sert des membres connectés et n'a pas de pages publiques à référencer.
- L'API Hono porte déjà toute la logique métier et les contrats (`packages/contracts`).
- Chaque PR doit avoir sa preview, comme l'API (ADR 0034).
- Coût et travail d'exploitation faibles.
- Routage et chargement de données typés.

## Options envisagées

### La stack de l'app web

#### Option A — SPA React : Vite, TanStack Router et TanStack Query

- Avantage : le routage et le chargement de données sont typés, et Query gère le cache. L'app appelle l'API directement, avec les contrats partagés.
- Avantage : le build produit des fichiers statiques, sans runtime serveur à héberger ni CPU consommé par requête.
- Inconvénient : le premier affichage attend le JavaScript, puis les données.
- **Retenue.**

#### Option B — TanStack Start

- Avantage : rendu serveur et premier affichage plus rapide, avec le même routeur.
- Inconvénient : ses fonctions serveur font doublon avec l'API Hono, et ajoutent une couche entre le navigateur et le backend.
- Inconvénient : il faut un runtime serveur, qui consomme du CPU par requête sur Workers, ou un serveur Node à exploiter.
- **Écartée** : le rendu serveur n'apporte presque rien à une app derrière une connexion.

### Où servir l'app web

#### Option A — Fichiers statiques sur Cloudflare

- Avantage : les requêtes vers les fichiers statiques sont gratuites et servies par le CDN.
- Avantage : Wrangler publie une version par commit avec son URL, comme pour l'API.
- Avantage : `dezyn.dev` et `api.dezyn.dev` restent dans la même zone.
- **Retenue.**

#### Option B — Un VPS qui sert l'app web et l'API

- Avantage : pas de plafond de CPU par requête, et l'API n'est construite qu'une fois, au démarrage du processus.
- Inconvénient : l'exploitation (mises à jour, TLS, supervision, déploiement par SSH) revient à l'équipe.
- Inconvénient : les previews par PR sont à reconstruire, et le serveur est une seule machine dans une seule région.
- **Écartée** : avec une SPA, le frontend ne demande aucun serveur, et le plan Workers Paid règle le plafond de CPU de l'API pour 5 $/mois.

## Décision

### 1. Une SPA React

L'app web vit dans `apps/web`. C'est une SPA React construite par Vite, avec TanStack Router pour le routage et TanStack Query pour les données. Elle appelle l'API HTTP de `api.dezyn.dev` et type ses échanges avec `packages/contracts`.

### 2. Servie en statique par Cloudflare

Le build est servi sur `dezyn.dev` par les fichiers statiques d'un Worker, avec le repli SPA (`not_found_handling: "single-page-application"`). Chaque commit d'une PR publie une version de preview, avec son URL.

### 3. La session passe par le cookie de l'API

L'app web se connecte par les routes de better-auth sur `api.dezyn.dev`, et envoie ses requêtes avec `credentials: "include"`. `dezyn.dev` et `api.dezyn.dev` sont le même site, donc le cookie de session `SameSite=Lax` part avec chaque requête. L'API répond au CORS pour l'origine `WEB_URL` seulement, avec `Access-Control-Allow-Credentials`, et better-auth ajoute `WEB_URL` à ses `trustedOrigins`.

## Conséquences

### Positives

- Servir le frontend ne coûte rien, et il n'y a aucun serveur à exploiter.
- Une seule source de vérité métier : l'API, que l'app web et le MCP partagent.
- Les previews de l'app web suivent le même circuit que celles de l'API.

### Négatives

- Le premier affichage attend le JavaScript, puis les données.
- L'API doit gérer le CORS avec cookies, ce qui ajoute une surface à tester.
- Ajouter des pages publiques à référencer demandera un pré-rendu ou un site séparé.

### Risques et mitigations

- Previews sur `workers.dev` : `workers.dev` est un suffixe public, donc une preview de l'app web et une preview de l'API sont deux sites différents, et le cookie `SameSite=Lax` ne passe pas entre elles. Mitigation à trancher quand la preview de l'app web arrive : un proxy même-origine (le Worker de l'app web relaie `/api` vers l'API de preview) ou des previews sous un sous-domaine de `dezyn.dev`.
- Emails de production : l'ADR 0035 choisit Resend tant que le compte reste sur le plan Workers Free. Avec le plan Workers Paid, Cloudflare Email Service (son option B) redevient possible sans coût en plus. Resend reste en place, et le choix est un point ouvert.
- CORS trop large : l'API n'accepte qu'une origine exacte, `WEB_URL`, et jamais `*` avec les cookies.

## Notes d'implémentation

1. Passer le compte Cloudflare au plan Workers Paid, pour l'API.
2. Créer `apps/web` (Vite, React, TanStack Router, TanStack Query) et son `wrangler.jsonc` avec `assets` et le repli SPA.
3. Ajouter le CORS et `trustedOrigins` à l'API pour `WEB_URL`, avec des tests.
4. Brancher le déploiement et la preview de `apps/web` dans la CI.

## Liens

- [ADR 0034](0034-l-api-est-servie-par-un-worker-cloudflare.md) — l'API est un Worker Cloudflare ; l'app web suit le même hébergeur.
- [ADR 0008](0008-hono-pour-le-backend-better-auth-pour-l-authentification.md) — better-auth porte la session que l'app web utilise.
- [ADR 0012](0012-les-ecritures-de-l-ia-sont-des-propositions-relues-par-un-editeur.md) — la relecture des propositions est l'un des écrans de l'app web.
- [ADR 0035](0035-les-emails-de-production-passent-par-resend.md) — le plan Workers Paid retire sa prémisse ; le choix de Resend devient un point ouvert.
