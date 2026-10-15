# Plan : Connexion de l'IA au MCP

**Branche** : feat/connexion-ia-mcp
**Statut** : Actif
**ADR** : 0007, 0008, 0018, 0020

## Objectif

Un utilisateur connecte son app d'IA (Claude Code, claude.ai, ChatGPT) au MCP de dezyn par OAuth 2.1, et chaque appel MCP est rattaché à lui tant que son accès n'est pas révoqué.

## Critères d'acceptation

- [ ] Un utilisateur crée un compte et se connecte par email et mot de passe.
- [ ] Un client MCP découvre le serveur d'autorisation et s'enregistre sans action manuelle.
- [ ] Un appel MCP sans jeton reçoit 401 et un `WWW-Authenticate` qui pointe vers les métadonnées de ressource protégée.
- [ ] Avec un jeton valide, l'outil `whoami` renvoie l'utilisateur et le client OAuth.
- [ ] Un jeton dont la session est révoquée est refusé à l'appel suivant.
- [ ] Le rejeu d'un refresh token déjà utilisé révoque toutes les sessions de l'utilisateur.

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR. Chemins d'authentification : palier de revue `critical`.

### Tranche 1 : un utilisateur crée un compte et se connecte

**Valeur** : un humain a une identité sur dezyn, préalable à toute autorisation d'IA.
**Chemin** : `POST /auth/sign-up/email` puis `/auth/sign-in/email` → better-auth monté sur Hono → adaptateur Drizzle → tables `identity_*` migrées. Module `identity` (ADR 0020). Hors tranche : vérification d'email (Mailpit plus tard), OAuth.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `better-auth-best-practices`.
**Critères d'acceptation** :

- Une inscription crée un utilisateur avec un identifiant UUID.
- Une connexion avec le bon mot de passe ouvre une session ; avec un mauvais, répond 401 sans dire si l'email existe.
- Les tables d'identité sont créées par une migration versionnée.
  **RED** : tests d'intégration via `app.request` sur base réelle. Mutants attendus : génération d'identifiant, options d'adaptateur.
  **GREEN** : `modules/identity/infrastructure/better-auth.ts` (repris de `twitch` sans 2FA ni AMR), schéma Drizzle généré par `@better-auth/cli`, montage sur `/auth/*`.
  **Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 2 : un client MCP découvre le serveur et s'enregistre dynamiquement

**Valeur** : l'utilisateur colle l'URL du MCP dans son app d'IA et la connexion démarre sans configuration (ADR 0018 §5).
**Chemin** : `GET /.well-known/oauth-protected-resource` et `/.well-known/oauth-authorization-server` → `POST /auth/oauth2/register` → client enregistré. Hors tranche : écran de consentement.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `better-auth-best-practices`.
**Critères d'acceptation** :

- Les métadonnées de ressource nomment la ressource `/v1` et le serveur d'autorisation.
- Un enregistrement dynamique renvoie un `client_id`.
- La route d'enregistrement est limitée en débit (ADR 0018, risques).
  **RED** : tests d'intégration sur les trois routes ; test du dépassement de débit.
  **GREEN** : `oauthProvider` avec `allowDynamicClientRegistration`, `resources`, `storeTokens: { hash }`, plugin `jwt`.
  **Terminé quand** : critères remplis, rapport relu, commit approuvé.

### Tranche 3 : l'IA autorisée appelle l'outil MCP `whoami`

**Valeur** : bout en bout, l'IA du client parle au MCP au nom de l'utilisateur.
**Chemin** : écran `/consent` minimal → code d'autorisation PKCE → jeton → `POST /mcp` (Streamable HTTP) → middleware de vérification (`jose`, `at+jwt`, audience, émetteur) → outil `whoami` dans `modules/identity/presentation`. Introduit `@repo/result`, repris tel quel de `twitch`.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `typescript-strict`.
**Critères d'acceptation** :

- Sans jeton : 401, `WWW-Authenticate: Bearer resource_metadata="…"`.
- Jeton expiré, mal signé, d'une autre audience ou d'un autre `typ` : 401 `invalid_token`.
- Jeton valide : `whoami` renvoie l'identifiant de l'utilisateur et le `client_id`.
- Vérifié à la main avec Claude Code (`claude mcp add --transport http`).
  **RED** : tests unitaires du vérificateur avec des clés générées par `jose` (un cas par refus) ; test d'intégration du flux complet. Mutants attendus : chaque option de `jwtVerify`, le découpage du `scope`.
  **GREEN** : `packages/auth-verifier` repris de `twitch` (sans les claims `twitch_*`), middleware Hono, SDK MCP en Streamable HTTP.
  **Terminé quand** : critères remplis, rapport relu, commit approuvé.

### Tranche 4 : un jeton dont la session est révoquée est refusé

**Valeur** : l'utilisateur qui retire l'accès d'une IA ou se déconnecte est obéi à l'appel suivant (ADR 0018 §2).
**Chemin** : middleware → après la signature, lecture de la session par clé primaire → 401 si révoquée ; erreur si la base ne répond pas.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Après déconnexion, le jeton encore valide en signature répond 401.
- Base injoignable : l'appel échoue en 503 problem+json, jamais en 200.
  **RED** : test d'intégration déconnexion puis appel ; test unitaire du middleware avec un magasin de sessions qui lève. Mutants attendus : la branche « révoquée », l'inversion fail-open.
  **GREEN** : port `RevokedSessions` lu en PostgreSQL, sans le statut `unavailable` de `twitch`.
  **Terminé quand** : critères remplis, rapport relu, commit approuvé.

### Tranche 5 : le rejeu d'un refresh token révoque toutes les sessions

**Valeur** : un refresh token volé est neutralisé à son premier rejeu (ADR 0018 §3 et §4).
**Chemin** : `POST /auth/oauth2/token` (`refresh_token`) → hook `guardRefreshGrant` → `isRefreshTokenReuse` / `exceedsAbsoluteLifetime` → révocation de toutes les sessions.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Un rejeu dans la fenêtre de tolérance (30 s) est accepté.
- Un rejeu hors fenêtre révoque toutes les sessions ; le jeton d'accès suivant répond 401.
- Au-delà de la durée de vie absolue, le refresh répond `invalid_grant`.
  **RED** : tests unitaires des deux fonctions pures (bornes exactes) ; test d'intégration du rejeu. Mutants attendus : `>=` contre `>` sur les bornes de temps.
  **GREEN** : fonctions et hook repris de `twitch`, révocation en base seulement.
  **Terminé quand** : critères remplis, rapport relu, commit approuvé.

## Barrière avant PR

1. Mutation testing.
2. Évaluation du refactoring.
3. `pnpm check-types`, `pnpm lint`, `pnpm fmt:check`.
4. Vocabulaire conforme à `CONTEXT.md`.

---

_Supprimer ce fichier quand le plan est terminé._
