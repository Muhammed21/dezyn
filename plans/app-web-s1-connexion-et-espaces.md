# Plan : connexion et liste des espaces depuis l'app web (S1)

**Branche** : une par tranche (`feat/v1-session-cookie`, `feat/api-cors`, …)
**Statut** : Actif

Story S1 de [app-web-stories.md](app-web-stories.md). Décisions : ADR 0044.

## But

Un membre se connecte depuis l'app web et récupère la liste de ses espaces, par le cookie de session, sans qu'aucun jeton ne soit lisible par le JavaScript.

## Critères d'acceptation de la story

- [ ] Un membre connecté par `/auth/sign-in/email` reçoit ses espaces sur `GET /v1/spaces` avec son seul cookie.
- [ ] Le MCP en Bearer marche comme avant, et `/v1/mcp` refuse un cookie seul.
- [ ] Seule l'origine `WEB_URL` reçoit les en-têtes CORS.
- [ ] L'app web connecte un membre, lit sa session et liste ses espaces, validés par le contrat partagé.
- [ ] Sans session, l'app web obtient `unauthenticated` et renvoie vers la connexion.
- [ ] Les règles `dezyn/*` s'appliquent à `apps/web/src/modules`.

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR et charge `tdd`, `testing`, `mutation-testing` et `refactoring` avant tout code. Ses critères sont validés avant le premier test, et chaque commit attend l'accord.

### Tranche 1 : un membre lit ses espaces sur `/v1` avec son cookie de session

**Valeur** : le navigateur d'un membre lit l'API sans jeton OAuth ; c'est la porte d'entrée de toute l'app web.
**Chemin** : `requireAccessToken` devient le middleware d'identité de `/v1` : un en-tête `Authorization` décide seul ; sinon le cookie est vérifié par `auth.api.getSession` (session lue en base). Les routes HTTP ne lisent que `userId`. `/v1/mcp` garde le Bearer seul, parce que ses outils attribuent les actions au client OAuth (`clientId`).
**Critères** :

- un membre connecté par `/auth/sign-in/email` reçoit 200 et ses espaces sur `GET /v1/spaces` avec le cookie renvoyé ;
- après `/auth/sign-out`, le même cookie reçoit 401 ;
- sans cookie ni `Authorization`, 401 avec `www-authenticate`, comme avant ;
- un `Authorization` invalide avec un cookie valide reçoit 401 `invalid_token` ;
- `POST /v1/mcp` avec un cookie seul reçoit 401 ;
- une écriture (`POST`, `PUT`, `PATCH`, `DELETE`) avec un cookie seul reçoit 403, en attendant le contrôle d'origine de S2 ;
- base indisponible pendant la lecture de session : 503.
  **RED** : tests d'intégration sur la vraie app, base jetable, cookie réel. Mutants probables : la condition « en-tête présent », la liste des méthodes sûres, l'exclusion de `/v1/mcp`.
  **GREEN** : lecture de la session par better-auth derrière un port de l'`Auth`, identité commune `{ userId }` pour les routes HTTP.

### Tranche 2 : l'API répond au CORS de `WEB_URL` seulement

**Valeur** : l'app web, sur une autre origine, peut lire les réponses de l'API avec son cookie.
**Chemin** : middleware CORS de Hono sur `/v1/*` et `/auth/*`, origine exacte `WEB_URL`, `credentials: true` ; `trustedOrigins: [WEB_URL]` dans better-auth.
**Critères** :

- un préflight depuis `WEB_URL` reçoit `Access-Control-Allow-Origin: <WEB_URL>` et `Access-Control-Allow-Credentials: true` ;
- un préflight ou une requête depuis une autre origine ne reçoit aucun en-tête `Access-Control-*` ;
- une connexion `/auth/sign-in/email` avec `Origin: <WEB_URL>` réussit ; avec une autre origine, better-auth la refuse.
  **RED** : tests sur l'app avec `Origin` variés ; mutants sur la comparaison exacte (préfixe, casse, `*`).

### Tranche 3 : le contrat des espaces vit dans `@repo/contracts`

**Valeur** : débloque la tranche 5 ; l'app web et l'API valident la même réponse.
**Chemin** : `MySpacesOutput` passe dans `packages/contracts/src/space/`, avec ses propres listes `PLANS` et `ROLES` ; l'outil MCP et la route `GET /v1/spaces` l'utilisent. Un test de l'API vérifie que les listes du contrat égalent celles du domaine (le domaine n'importe aucun paquet, ADR 0022).
**Critères** : la réponse de `GET /v1/spaces` et celle de `list_spaces` passent `MySpacesOutput` importé de `@repo/contracts` ; un écart entre les rôles du contrat et ceux du domaine fait échouer un test.
**Exception horizontale** : déplacement mécanique, vérifié par les tests existants et le test d'égalité.

### Tranche 4 : les règles d'architecture couvrent `apps/web`

**Valeur** : débloque la tranche 5 ; la logique de l'app web ne peut pas dépendre de React ou de l'infrastructure.
**Chemin** : `packages/lint` lit les modules de `apps/web/src/modules` comme ceux de l'API ; une règle refuse `react`, `@tanstack/*` et `react-dom` hors de `presentation` et de la racine de composition.
**Critères** : `RuleTester` et le test de configuration prouvent chaque refus sur des fichiers de `apps/web` ; les règles de l'API ne changent pas de comportement.
**Exception horizontale** : sans elle, la tranche 5 poserait du code que rien ne surveille.

### Tranche 5 : l'app web connecte un membre et lit sa session

**Valeur** : un membre ouvre sa session depuis l'app web.
**Chemin** : création de `apps/web` (Vite, TypeScript, Vitest), sans React : React, TanStack et `main.tsx` arrivent en tranche 6 avec la route qui les utilise. Module `identity` : domaine (`Session`), cas d'usage `signIn` et `currentSession`, port `IdentityGateway`, passerelle HTTP sur `/auth/sign-in/email` et `/auth/get-session` avec `credentials: "include"`. La passerelle ne garde jamais le `token` que better-auth met dans ses réponses.
**Critères** :

- de bons identifiants donnent une session avec l'identifiant et l'email du membre ;
- un mauvais mot de passe donne `invalid_credentials` ;
- sans cookie, `currentSession` ne donne aucune session ;
- une API injoignable donne `unavailable` ; une réponse hors contrat donne `invalid_response`.
  **RED** : cas d'usage en unitaire avec une passerelle en mémoire ; passerelle en intégration contre la vraie API Hono en Node (base jetable), avec un `fetch` qui garde les cookies. Les tests importent les aides de test de l'API par une dépendance de développement.

### Tranche 5 bis : aucune réponse de `/auth` ne donne le jeton de session au JavaScript

**Valeur** : un script qui s'exécute dans la page ne peut pas lire ni exfiltrer le jeton de session ; le cookie HttpOnly reste le seul porteur de la session.
**Chemin** : better-auth met `token` dans la réponse de `/auth/sign-in/email` et `session.token` dans celle de `/auth/get-session`. L'API retire ces champs des réponses de `/auth/*`, et vérifie ce que `/auth/token` (plugin jwt) donne à un appel par cookie depuis `WEB_URL`.
**Critères** : à préciser avant le premier test ; au minimum, aucune réponse de `/auth/sign-in/email`, `/auth/sign-up/email` et `/auth/get-session` ne contient le jeton de session, et la connexion par cookie marche toujours.

### Tranche 6 : l'app web liste les espaces du membre, ou renvoie vers la connexion

**Valeur** : le membre retrouve ses espaces dans le navigateur ; fin de la story S1.
**Chemin** : ajout de React, TanStack Router et Query, et de la racine de composition `main.tsx`. Module `space` : domaine (`Space`, rôle), cas d'usage `listMySpaces`, port `SpaceGateway`, passerelle HTTP qui parse `MySpacesOutput` puis traduit vers le modèle web ; `presentation` : hook TanStack Query et route `/` brute qui affiche les noms ou renvoie vers `/connexion` sur `unauthenticated`.
**Critères** :

- un membre connecté reçoit ses espaces dans le modèle web (nom, plan, rôle) ;
- sans session, le cas d'usage donne `unauthenticated` et la route renvoie vers `/connexion` ;
- un rôle inconnu de l'app (enum ouvert, ADR 0023) ne casse pas la liste.
  **RED** : unitaire pour la traduction et le cas d'usage ; intégration contre la vraie API pour la passerelle ; la route en Vitest Browser Mode.

## Contrôle avant chaque PR

1. Mutation testing sur le code modifié.
2. Évaluation du refactoring.
3. Types, lint et tests au vert.
4. Vocabulaire conforme à `CONTEXT.md`.

---

_Supprimer ce fichier quand le plan est fini._
