# 0018 — Jetons d'accès JWT liés à l'API, session vérifiée en base à chaque appel

- Statut : Proposé
- Date : 2026-10-15
- Décideurs : Muhammed

## Contexte et problématique

L'IA du client accède au MCP par OAuth 2.1 (ADR 0007 §4), servi par le plugin OAuth de better-auth (ADR 0008 §3). Chaque appel est rattaché à un utilisateur identifié et révocable (ADR 0007). Les apps d'IA web (claude.ai, ChatGPT) s'enregistrent elles-mêmes comme clients OAuth.

La plateforme n'a pas de Redis : PostgreSQL est le seul stockage de l'API (ADR 0009). L'API et le MCP sont servis par la même application (ADR 0007 §1).

Problématique : quelle forme ont les jetons d'accès, et comment l'API vérifie-t-elle qu'un jeton n'est pas révoqué ?

## Facteurs de décision

- Une révocation (déconnexion, retrait d'une IA autorisée, suppression de compte) prend effet sur l'appel suivant.
- Pas de nouveau service à exploiter.
- Les clients MCP attendent un serveur d'autorisation conforme : enregistrement dynamique, jeton lié à la ressource (RFC 8707).
- Un refresh token volé et rejoué est détecté.

## Options envisagées

### Option A — JWT vérifié localement, puis session contrôlée en base

- Avantage : signature, audience et expiration vérifiées sans requête ; la révocation prend effet immédiatement.
- Inconvénient : une lecture en base par appel.
- **Retenue.**

### Option B — JWT court sans contrôle de révocation

- Avantage : aucune lecture par appel.
- Inconvénient : une révocation attend l'expiration du jeton.
- **Écartée.**

### Option C — Jeton opaque introspecté

- Avantage : révocation immédiate.
- Inconvénient : tout le contrôle passe par la base, sans le bénéfice d'une vérification locale de la signature et de l'audience.
- **Écartée.**

## Décision

### 1. Le jeton d'accès est un JWT lié à l'API

Le jeton d'accès est un JWT signé par les clés JWKS de better-auth, de type `at+jwt`, dont l'audience est la ressource de l'API. Un jeton émis pour une autre ressource est refusé.

### 2. Chaque appel vérifie la session en base

Après la vérification de la signature, de l'émetteur, de l'audience et de l'expiration, l'API vérifie dans PostgreSQL que la session du jeton existe et n'est pas révoquée. Si la base ne répond pas, l'appel échoue.

### 3. Les refresh tokens sont stockés hachés et tournent

Un refresh token n'est stocké que haché. Chaque usage en émet un nouveau. Le rejeu d'un refresh token déjà utilisé, hors d'une courte fenêtre de tolérance, révoque toutes les sessions de l'utilisateur.

### 4. Une connexion a une durée de vie absolue

Au-delà d'une durée de vie absolue depuis l'authentification, le refresh est refusé et l'utilisateur se reconnecte.

### 5. Les clients MCP s'enregistrent dynamiquement

Le serveur d'autorisation accepte l'enregistrement dynamique des clients et publie les métadonnées de ressource protégée (`/.well-known/oauth-protected-resource`).

## Conséquences

### Positives

- Retirer l'accès d'une IA ou déconnecter un appareil prend effet sur l'appel suivant.
- Un refresh token volé est neutralisé à son premier rejeu.
- Aucun service de plus que PostgreSQL.

### Négatives

- Une lecture en base par appel d'API et de MCP.
- Une panne de PostgreSQL bloque toute requête authentifiée.
- Le rejeu légitime d'un refresh token (deux onglets, réseau instable) hors de la fenêtre de tolérance déconnecte l'utilisateur partout.

### Risques et mitigations

- **Coût de la lecture par appel** : lecture par clé primaire de la session ; un cache n'est ajouté que si une mesure le demande.
- **Enregistrement dynamique abusé** (clients en masse) : limitation de débit sur la route d'enregistrement.
- **Rotation des clés JWKS** : période de grâce pendant laquelle l'ancienne clé reste publiée.

## Notes d'implémentation

Valeurs de départ, reprises de `twitch` et à confirmer : jeton d'accès 15 min, refresh token 60 jours, fenêtre de tolérance au rejeu 30 s, durée de vie absolue 180 jours, rotation JWKS tous les 90 jours avec 1 jour de grâce.

Configuration better-auth (`@better-auth/oauth-provider`) :

```ts
oauthProvider({
  resources: [new URL("/v1", baseURL).href],
  allowDynamicClientRegistration: true,
  storeTokens: { hash: hashToken },
  generateRefreshToken,
  refreshTokenReuseInterval: 30,
});
```

Repris de `twitch` : `hashToken`, `isRefreshTokenReuse`, `exceedsAbsoluteLifetime`, le hook `guardRefreshGrant` et le vérificateur `jose` (`typ: "at+jwt"`, audience, émetteur), qui renvoie un `Result`.

Les chemins d'authentification relèvent du palier de revue `critical` (ADR 0007, notes d'implémentation).

## Liens

- [ADR 0007](0007-un-seul-backend-api-et-mcp-streamable-http-oauth.md) — OAuth 2.1 pour le MCP.
- [ADR 0008](0008-hono-pour-le-backend-better-auth-pour-l-authentification.md) — better-auth fournit le serveur OAuth.
- [ADR 0009](0009-drizzle-pour-postgresql-migrations-hors-demarrage.md) — PostgreSQL, seul stockage de l'API.
