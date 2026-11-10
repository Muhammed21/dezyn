# Cadrage de l'app web : récupération des données et sécurité

La partie visuelle attend un chantier séparé. Ce chantier pose `apps/web` en architecture propre (clean architecture, DDD) : authentification, appels à l'API, contrats, erreurs.

## Constats

- `apps/web` n'existe pas. ADR 0037 : SPA React (Vite, TanStack Router, TanStack Query), servie en statique par Cloudflare.
- Les routes `/v1` n'acceptent qu'un JWT en `Authorization: Bearer` (`apps/api/src/platform/access-token.ts`, ADR 0018).
- L'API n'a ni CORS ni `trustedOrigins`.
- Les schémas de sortie vivent dans `apps/api/src/modules/*/contracts` ; `packages/contracts` ne porte que des conventions.

## Décisions

1. **Authentification de l'app web** : `/v1` accepte aussi le cookie de session better-auth (HttpOnly, `SameSite=Lax`), vérifié en base à chaque appel. Une requête authentifiée par cookie dont la méthode n'est ni `GET`, ni `HEAD`, ni `OPTIONS` exige `Origin` égal à l'origine de `WEB_URL` (`new URL(WEB_URL).origin`). Le Bearer JWT reste le chemin du MCP. À écrire en ADR.
2. **Contrats partagés** : les schémas d'entrée et de sortie HTTP passent de `apps/api/src/modules/*/contracts` à `@repo/contracts`, rangés par module. Les ports internes de l'API (`membership`, `storage-meter`, `project-lock`…) restent dans l'API. L'app web parse chaque réponse avec ces schémas, puis la traduit vers son propre modèle (couche anti-corruption).
3. **Structure de `apps/web/src`** : les modules du domaine (`identity`, `space`, `project`, `token`, `proposal`, `history`), chacun en couches `domain` (pur), `application` (cas d'usage, ports), `infrastructure` (passerelles HTTP), `presentation` (hooks TanStack Query, routes). `platform/` porte le client HTTP et les problèmes ; `main.tsx` est la racine de composition. Les règles `dezyn/*` s'étendent à `apps/web/src/modules` ; React et TanStack ne sont permis qu'en `presentation` et à la racine.
4. **Droits** : chaque espace de la réponse de l'API porte `allowedActions`, calculé par `can()`. L'app web affiche selon ce champ et ne recalcule aucun droit.
5. **Connexion** : le module `identity` de l'app web a les cas d'usage `signIn`, `signUp`, `signOut` et `currentSession`, derrière un port `IdentityGateway` implémenté sur les routes `/auth/*` de better-auth. La page `/login` de l'API reste celle de l'OAuth du MCP.
6. **Tests** : domaine et cas d'usage en unitaire avec des ports en mémoire ; passerelles HTTP en intégration contre la vraie API Hono en Node, sur une base Postgres jetable, avec un vrai cookie.

## Choix par défaut

- Les échecs remontent en `Result` (`@repo/result`) avec des raisons typées : `unauthenticated`, `not_found`, `conflict`, `unavailable`, `invalid_response`. `unauthenticated` renvoie vers la connexion.
- En local, l'app web (`http://localhost:5173`) appelle l'API sans proxy, avec le CORS de `WEB_URL`, comme en production.
- Les previews de l'app web (risque `workers.dev` de l'ADR 0037) se tranchent avec le déploiement, hors de ce chantier.
