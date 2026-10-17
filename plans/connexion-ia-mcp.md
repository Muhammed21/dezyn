# Plan : Connexion de l'IA au MCP

**Branche** : feat/connexion-ia-mcp
**Statut** : Actif
**ADR** : 0007, 0008, 0018, 0020, 0021, 0023

## Objectif

Un utilisateur connecte son app d'IA (Claude Code, claude.ai, ChatGPT) au MCP de dezyn par OAuth 2.1, et chaque appel MCP est rattaché à lui tant que son accès n'est pas révoqué.

## Critères d'acceptation

- [ ] Un utilisateur crée un compte et se connecte par email et mot de passe.
- [ ] Un client MCP découvre le serveur d'autorisation et s'enregistre sans action manuelle.
- [ ] Après le consentement de l'utilisateur, l'app d'IA obtient un jeton d'accès lié à l'API.
- [ ] Un appel MCP sans jeton reçoit 401 et un `WWW-Authenticate` qui pointe vers les métadonnées de ressource protégée.
- [ ] Avec un jeton valide, l'outil `whoami` renvoie l'utilisateur et le client OAuth.
- [ ] Un schéma de sortie exporté par un `contracts/` qui ne suit pas les conventions de l'ADR 0023 fait échouer les tests.
- [ ] Un jeton dont la session est révoquée est refusé à l'appel suivant.
- [ ] Le rejeu d'un refresh token déjà utilisé révoque toutes les sessions de l'utilisateur.

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR. Chemins d'authentification : palier de revue `critical`. Valeurs des jetons : ADR 0018, notes d'implémentation. `whoami` ne vise ni espace ni projet : il ne laisse pas d'entrée d'historique (ADR 0021 §2).

### Tranche 1 : un utilisateur crée un compte et se connecte

**Valeur** : un humain a une identité sur dezyn, préalable à toute autorisation d'IA.
**Chemin** : `POST /auth/sign-up/email` puis `/auth/sign-in/email` → better-auth monté sur Hono → adaptateur Drizzle → tables `identity_*` migrées. Module `identity` (ADR 0020). Hors tranche : vérification d'email (Mailpit), OAuth.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `better-auth-best-practices`.
**Critères d'acceptation** :

- Une inscription crée un utilisateur avec un identifiant UUID.
- Une connexion avec le bon mot de passe ouvre une session ; avec un mauvais, répond 401 sans dire si l'email existe.
- Les tables d'identité sont créées par une migration versionnée.

**RED** : tests d'intégration via `app.request` sur base réelle. Mutants attendus : génération d'identifiant, options d'adaptateur.
**GREEN** : `modules/identity/infrastructure/better-auth.ts` (repris de `twitch` sans 2FA ni AMR), schéma Drizzle généré par `@better-auth/cli`, montage sur `/auth/*`.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
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
**GREEN** : configuration `oauthProvider` et plugin `jwt` de l'ADR 0018 (notes d'implémentation).
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 3 : l'utilisateur autorise son IA et elle reçoit un jeton lié à l'API

**Valeur** : l'utilisateur voit quelle IA demande l'accès et décide ; l'IA autorisée repart avec un jeton utilisable (ADR 0018 §1).
**Chemin** : `GET /auth/oauth2/authorize` (PKCE) → connexion si besoin → écran `/consent` minimal → code d'autorisation → `POST /auth/oauth2/token` → jeton d'accès `at+jwt` et refresh token haché en base. Hors tranche : vérification du jeton par l'API.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `better-auth-best-practices`.
**Critères d'acceptation** :

- L'écran de consentement nomme le client OAuth qui demande l'accès.
- Un refus renvoie l'utilisateur vers le client avec `error=access_denied`.
- Le jeton obtenu est de type `at+jwt`, son audience est la ressource `/v1`, son `sub` est l'utilisateur.
- Un échange de code sans le bon `code_verifier` est refusé.
- Le refresh token n'est stocké que haché.

**RED** : test d'intégration du flux complet avec un client enregistré par la tranche 2 ; test du refus ; test du mauvais `code_verifier`. Mutants attendus : options de `storeTokens`, audience.
**GREEN** : page `/consent` minimale, `hashToken` et `generateRefreshToken` repris de `twitch`.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 4 : l'IA autorisée appelle l'outil MCP `whoami`

**Valeur** : bout en bout, l'IA du client parle au MCP au nom de l'utilisateur.
**Chemin** : `POST /mcp` (Streamable HTTP) → middleware de vérification (`jose`, `at+jwt`, audience, émetteur) → outil `whoami` dans `modules/identity/presentation`. Introduit `@repo/result`, repris tel quel de `twitch`, et les conventions de contrat de l'ADR 0023.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `typescript-strict`.
**Critères d'acceptation** :

- Sans jeton : 401, `WWW-Authenticate: Bearer resource_metadata="…"`.
- Jeton expiré, mal signé, d'une autre audience ou d'un autre `typ` : 401 `invalid_token`.
- Jeton valide : `whoami` renvoie l'identifiant de l'utilisateur et le `client_id`.
- Le schéma de sortie de `whoami` est un objet ouvert : une clé inconnue ne le fait pas échouer (ADR 0023 §1).
- Le garde des schémas de sortie échoue sur un objet fermé, un enum nu, une union sans repli et un type de schéma qu'il ne sait pas vérifier ; une union marquée `.meta({ closed: true })` passe (ADR 0023 §3-4).
- Vérifié à la main avec Claude Code (`claude mcp add --transport http`).

**RED** : tests unitaires du vérificateur avec des clés générées par `jose` (un cas par refus) ; test d'intégration avec un jeton obtenu par la tranche 3. Tests unitaires de `openEnum`, `extensibleUnion` et du garde sur des schémas fabriqués. Mutants attendus : chaque option de `jwtVerify`, le découpage du `scope`, chaque branche du garde.
**GREEN** : `packages/auth-verifier` repris de `twitch` (sans les claims `twitch_*`), middleware Hono, SDK MCP en Streamable HTTP, schéma de sortie de `whoami` dans `modules/identity/contracts`, `openEnum`, `extensibleUnion` et `Uuid` repris de `twitch` (`packages/contracts/src/conventions`), garde `check-response` adapté aux `contracts/` des modules.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 5 : un jeton dont la session est révoquée est refusé

**Valeur** : l'utilisateur qui retire l'accès d'une IA ou se déconnecte est obéi à l'appel suivant (ADR 0018 §2).
**Chemin** : middleware → après la signature, lecture de la session par clé primaire → 401 si révoquée ; erreur si la base ne répond pas.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Après déconnexion, le jeton encore valide en signature répond 401.
- Base injoignable : l'appel échoue en 503 problem+json, jamais en 200.

**RED** : test d'intégration déconnexion puis appel ; test unitaire du middleware avec un magasin de sessions qui lève. Mutants attendus : la branche « révoquée », l'inversion fail-open.
**GREEN** : port `RevokedSessions` lu en PostgreSQL, sans le statut `unavailable` de `twitch`.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 6 : le rejeu d'un refresh token révoque toutes les sessions

**Valeur** : un refresh token volé est neutralisé à son premier rejeu (ADR 0018 §3 et §4).
**Chemin** : `POST /auth/oauth2/token` (`refresh_token`) → hook `guardRefreshGrant` → `isRefreshTokenReuse` / `exceedsAbsoluteLifetime` → révocation de toutes les sessions.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Un rejeu dans la fenêtre de tolérance est accepté.
- Un rejeu hors fenêtre révoque toutes les sessions ; le jeton d'accès suivant répond 401.
- Au-delà de la durée de vie absolue, le refresh répond `invalid_grant`.

**RED** : tests unitaires des deux fonctions pures (bornes exactes) ; test d'intégration du rejeu. Mutants attendus : `>=` contre `>` sur les bornes de temps.
**GREEN** : fonctions et hook repris de `twitch`, révocation en base seulement.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

## Barrière avant PR

1. Mutation testing (skill `mutation-testing`).
2. Évaluation du refactoring (skill `refactoring`).
3. `pnpm check-types`, `pnpm lint`, `pnpm fmt:check`.
4. Vocabulaire conforme à `CONTEXT.md`.

---

_Supprimer ce fichier quand le plan est terminé._
