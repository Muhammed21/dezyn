# Plan : S3, un visiteur crée son compte et un membre ferme sa session

**Branche** : une par tranche
**Statut** : actif
**Story** : S3 de `plans/app-web-stories.md`, [#205](https://github.com/Muhammed21/dezyn.dev/issues/205) ; ADR 0044.

## But

Depuis l'app web, un visiteur crée son compte et arrive connecté sur ses espaces ; un membre ferme sa session, et l'ancien cookie ne donne plus accès à `/v1`.

## Critères d'acceptation de la story

- [ ] Après `signOut`, `/v1` répond 401 avec l'ancien cookie.
- [ ] Une inscription avec un email déjà pris échoue avec une raison typée.
- [ ] Une session expirée ou fermée renvoie vers `/connexion` depuis chaque page de l'app.

Reporté : la vérification de l'email, le mot de passe oublié, la révocation d'une autre session que la sienne (#199).

## API utilisée

better-auth, sans changement côté API :

- `POST /auth/sign-up/email` (`name`, `email`, `password`) : crée le compte, l'espace personnel (hook de l'API) et la session, cookie posé. 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` pour un email pris ; 400 `PASSWORD_TOO_SHORT` ou `PASSWORD_TOO_LONG` (8 à 128 caractères) ; 400 `VALIDATION_ERROR` pour un email invalide, que seul le message nomme ; 429 au-delà du débit. Un nom vide est accepté.
- `POST /auth/sign-out` : supprime la session en base et efface le cookie ; contrôle d'origine de better-auth (`trustedOrigins`).

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR et charge `tdd`, `testing`, `mutation-testing` et `refactoring` avant tout code. Ses critères sont validés avant le premier test, et chaque commit attend l'accord.

### Tranche 1 : l'app web inscrit un visiteur

**Valeur** : le cas d'usage de la page d'inscription, prouvé contre la vraie API.
**Chemin** : `signUp({ name, email, password })` dans le module `identity`, sur `POST /auth/sign-up/email`.
**Critères** : la session ouverte (`{ userId, email }`), et l'espace personnel lisible juste après ; `invalid_name` et `invalid_email` vérifiés par l'app avant tout appel (`z.email()`, la règle de better-auth) ; échecs `email_taken`, `invalid_password`, `rate_limited`, `unavailable`, `invalid_response`.

### Tranche 2 : l'app web ferme la session du membre

**Valeur** : le cas d'usage de la déconnexion, prouvé contre la vraie API.
**Chemin** : `signOut()` dans le module `identity`, sur `POST /auth/sign-out`.
**Critères** : après `signOut`, `/v1/spaces` répond 401 avec le même navigateur, et une requête qui rejoue l'ancien cookie aussi ; `unavailable`, `invalid_response`.

### Tranche 3 : la page brute d'inscription

**Valeur** : le visiteur crée son compte dans le navigateur.
**Chemin** : route `/inscription`, liens croisés avec `/connexion` ; une inscription réussie oublie les données lues avant et mène à `/`.
**Critères** : tests navigateur sur l'inscription réussie, chaque échec annoncé, le bouton désactivé pendant l'envoi.

### Tranche 4 : la déconnexion depuis l'app

**Valeur** : le membre ferme sa session dans le navigateur.
**Chemin** : bouton « Se déconnecter » sur `/` ; une déconnexion réussie vide le cache des requêtes et mène à `/connexion`.
**Critères** : tests navigateur sur la déconnexion, le cache vidé, l'échec annoncé ; chaque page (`/`, `/espaces/$spaceId`, `/projets/$projectId`) renvoie déjà vers `/connexion` sur `unauthenticated`.

## Contrôle avant chaque PR

1. Mutation testing sur le code modifié.
2. Évaluation du refactoring.
3. Types, lint et tests au vert.
4. Vocabulaire conforme à `CONTEXT.md`.

---

_Supprimer ce fichier quand le plan est fini._
