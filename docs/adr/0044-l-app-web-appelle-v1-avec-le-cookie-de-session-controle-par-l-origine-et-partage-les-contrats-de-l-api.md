# 0044 — L'app web appelle `/v1` avec le cookie de session, contrôlé par l'origine, et partage les contrats de l'API

- Statut : Accepté
- Date : 2026-11-10
- Décideurs : Muhammed Cavus
- Amende : ADR 0037 (§3, la session de l'app web sur `/v1`), ADR 0020 (portée des règles d'architecture)

## Contexte et problématique

L'ADR 0037 §3 prévoit que l'app web se connecte par les routes de better-auth et envoie ses requêtes avec le cookie de session. Les routes `/v1` n'acceptent pourtant qu'un jeton d'accès JWT dans `Authorization: Bearer` (`apps/api/src/platform/access-token.ts`), le jeton OAuth du MCP (ADR 0018). Un cookie de session n'y ouvre rien.

L'API n'a ni CORS ni `trustedOrigins`. `dezyn.dev` et `api.dezyn.dev` sont le même site : un cookie `SameSite=Lax` part donc aussi avec une requête émise depuis n'importe quel autre sous-domaine de `dezyn.dev`.

Les schémas Zod des réponses HTTP vivent dans `apps/api/src/modules/*/contracts`, à côté des ports internes de l'API. `packages/contracts` ne porte que les conventions (ADR 0023). L'app web n'a aucun contrat à importer.

Les règles d'architecture (ADR 0020, ADR 0022) ne visent que `apps/api/src/modules`. La liste des espaces expose le rôle du membre, et l'API décide des droits par la fonction pure `can()` (ADR 0017).

Problématique : comment l'app web s'authentifie-t-elle sur `/v1` sans s'exposer au CSRF, d'où tient-elle ses contrats et ses droits, et quelle architecture suit-elle ?

## Facteurs de décision

- Aucun jeton lisible par le JavaScript de l'app web : une faille XSS ne doit pas permettre d'emporter un accès.
- Une révocation prend effet sur l'appel suivant, comme pour le MCP (ADR 0018).
- Pas de runtime serveur pour l'app web (ADR 0037).
- Une seule source de vérité pour les contrats et pour les droits.
- La logique de l'app web se teste sans React ni navigateur.

## Options envisagées

### L'authentification de l'app web sur `/v1`

#### Option A — `/v1` accepte aussi le cookie de session, avec un contrôle d'origine sur les écritures

- Avantage : le cookie est HttpOnly ; aucun jeton n'est lisible par le JavaScript.
- Avantage : better-auth vérifie la session en base à chaque appel, donc une déconnexion prend effet sur l'appel suivant.
- Inconvénient : un cookie part tout seul, donc les écritures doivent se protéger du CSRF.
- **Retenue.**

#### Option B — L'app web est un client OAuth public (code d'autorisation avec PKCE)

- Avantage : `/v1` ne change pas.
- Inconvénient : le refresh token vit dans le navigateur, à portée d'une faille XSS.
- Inconvénient : rappel OAuth, rafraîchissement et onglets multiples à gérer dans l'app.
- **Écartée** : plus de code pour une sécurité moindre que le cookie HttpOnly.

#### Option C — Un proxy même origine (BFF) dans le Worker de l'app web

- Avantage : le navigateur ne voit jamais de jeton, et aucun CORS n'est nécessaire.
- Inconvénient : un runtime serveur qui consomme du CPU à chaque requête, ce que l'ADR 0037 a écarté.
- **Écartée.**

### Les contrats de l'app web

#### Option A — Les schémas HTTP passent dans `@repo/contracts`

- Avantage : l'API et l'app web importent la même source ; un changement de l'API casse les types de l'app.
- Inconvénient : un déplacement de fichiers dans l'API, module par module.
- **Retenue.**

#### Option B — L'app web dépend de `apps/api`

- Inconvénient : l'app web tire le code serveur et ses dépendances (Hono, Drizzle), et voit les ports internes.
- **Écartée.**

#### Option C — L'app web réécrit ses schémas

- Inconvénient : deux copies qui divergent sans qu'aucun type ne casse.
- **Écartée.**

### Les droits dans l'app web

#### Option A — L'API renvoie les actions permises

- Avantage : la règle reste dans `can()`, et un changement de droits ne demande qu'un déploiement de l'API.
- Inconvénient : un champ de plus dans les réponses des espaces.
- **Retenue.**

#### Option B — `can()` partagée dans un paquet

- Inconvénient : une app web déjà chargée applique l'ancienne règle jusqu'à son rechargement.
- **Écartée.**

#### Option C — Aucun calcul côté web

- Inconvénient : l'app web propose des actions que l'API refuse toujours.
- **Écartée.**

### L'architecture de l'app web

#### Option A — Les modules et les couches de l'API

- Avantage : le même découpage des deux côtés, et les règles oxlint existantes s'étendent au lieu d'en écrire d'autres.
- Avantage : le domaine et les cas d'usage se testent sans React.
- Inconvénient : plus de fichiers qu'une SPA organisée par écran.
- **Retenue.**

#### Option B — Des couches globales

- Inconvénient : rien ne sépare les contextes, à l'inverse de l'API.
- **Écartée.**

#### Option C — Un dossier par fonctionnalité, sans couches

- Inconvénient : la logique glisse dans les composants et les hooks, et ne se teste plus sans React.
- **Écartée.**

## Décision

### 1. `/v1` accepte deux preuves d'identité

Une requête vers `/v1` est authentifiée par un jeton d'accès JWT dans `Authorization: Bearer` (ADR 0018), ou, à défaut d'en-tête `Authorization`, par le cookie de session de better-auth. La session du cookie est vérifiée en base à chaque appel. Les deux produisent la même identité pour les cas d'usage. Une requête qui porte un en-tête `Authorization` invalide est refusée, même avec un cookie valide.

### 2. Une écriture par cookie exige l'origine de l'app web

Une requête authentifiée par cookie dont la méthode n'est ni `GET`, ni `HEAD`, ni `OPTIONS` est refusée en 403 si son en-tête `Origin` n'est pas exactement l'origine de `WEB_URL` (`new URL(WEB_URL).origin`), ou s'il manque. Une requête authentifiée par Bearer n'est pas soumise à ce contrôle.

### 3. Le CORS de l'API ne répond qu'à `WEB_URL`

L'API répond au CORS de l'origine exacte de `WEB_URL` (`new URL(WEB_URL).origin`), pas à `WEB_URL` telle qu'écrite, avec `Access-Control-Allow-Credentials: true`, sur `/v1` et `/auth/*`. Aucune autre origine ne reçoit d'en-tête CORS. better-auth ajoute cette origine à ses `trustedOrigins`.

### 4. Les contrats HTTP vivent dans `@repo/contracts`

Les schémas d'entrée et de sortie des routes HTTP et des outils MCP passent dans `packages/contracts/src/<module>/`. Les ports internes de l'API (appartenance, compteur de stockage, verrou de projet) restent dans `apps/api/src/modules/*/contracts`. L'app web parse chaque réponse avec ces schémas, puis la traduit vers son propre modèle dans sa couche `infrastructure`.

### 5. Chaque espace porte ses actions permises

Chaque espace des réponses de l'API porte `allowedActions`, la liste des actions que `can()` accorde au membre. L'app web affiche selon ce champ et ne recalcule aucun droit. L'API reste seule juge de chaque requête.

### 6. L'app web suit les modules et les couches de l'API

`apps/web/src/modules/<module>/` a les couches `domain`, `application`, `infrastructure` et `presentation`, pour les modules `identity`, `space`, `project`, `token`, `proposal` et `history`. `apps/web/src/platform/` porte le client HTTP et les problèmes, et `apps/web/src/main.tsx` est la racine de composition. Les règles `dezyn/*` s'appliquent à `apps/web/src/modules`. React et TanStack ne sont importés que dans `presentation` et à la racine de composition.

### 7. L'app web gère la session par ses propres cas d'usage

Le module `identity` de l'app web a les cas d'usage `signIn`, `signUp`, `signOut` et `currentSession`, derrière un port implémenté sur les routes `/auth/*` de better-auth, appelées avec `credentials: "include"`. La page `/login` de l'API reste celle du parcours OAuth du MCP.

## Conséquences

### Positives

- Aucun jeton dans le JavaScript de l'app web, et une déconnexion coupe l'accès sur l'appel suivant.
- L'API, le MCP et l'app web partagent un seul jeu de contrats et une seule règle de droits.
- La logique de l'app web se teste en unitaire, et ses passerelles contre la vraie API.

### Négatives

- `/v1` a deux chemins d'authentification à tester, et chaque nouvelle méthode d'écriture doit passer par le contrôle d'origine.
- Déplacer les contrats touche tous les modules de l'API.
- Les réponses des espaces grossissent de `allowedActions`.

### Risques et mitigations

- **Une écriture oubliée par le contrôle d'origine** : le contrôle s'applique dans le middleware d'authentification de `/v1`, pour toute méthode autre que `GET`, `HEAD` et `OPTIONS`, et non route par route.
- **Un sous-domaine de `dezyn.dev` compromis** : il partage le site et reçoit le cookie `SameSite=Lax`, mais son origine n'est pas `WEB_URL`, donc ses écritures sont refusées. Ses lectures ne reçoivent pas d'en-tête CORS, donc le navigateur ne lui montre pas les réponses.
- **Confusion entre les deux preuves** : un en-tête `Authorization` présent décide seul ; le cookie n'est lu qu'en son absence.
- **Previews `workers.dev`** : le cookie ne passe pas entre deux sites `workers.dev` (ADR 0037, risques). La solution se tranche avec le déploiement de l'app web.

## Notes d'implémentation

1. Le module des espaces : déplacer son contrat HTTP dans `@repo/contracts`, accepter le cookie en lecture sur `/v1`, ajouter le CORS, créer `apps/web` avec la connexion et la liste des espaces, étendre les règles `dezyn/*`.
2. La première écriture par cookie (création d'un projet) avec le contrôle d'origine.
3. `allowedActions`, puis les autres modules, un par un.

## Liens

- [ADR 0037](0037-l-app-web-est-une-spa-react-servie-en-statique-par-cloudflare.md) — §3 amendé : le cookie de session ouvre `/v1`, contrôlé par l'origine.
- [ADR 0018](0018-jetons-d-acces-jwt-lies-a-l-api-session-verifiee-en-base-a-chaque-appel.md) — le Bearer JWT reste la preuve du MCP ; la session est vérifiée en base dans les deux cas.
- [ADR 0020](0020-modules-et-couches-de-l-api-imposes-par-des-regles-oxlint.md) — ses règles s'étendent à `apps/web`.
- [ADR 0022](0022-architecture-hexagonale-a-coeur-fonctionnel-pour-le-backend.md) — l'app web reprend le cœur fonctionnel et les couches.
- [ADR 0023](0023-reponses-ouvertes-enums-ouverts-et-unions-extensibles-dans-les-contrats.md) — les contrats déplacés gardent leurs conventions.
- [ADR 0017](0017-les-roles-des-membres-vivent-dans-une-table-de-l-espace-evalues-par-une-fonction-pure.md) — `can()` calcule `allowedActions`.
