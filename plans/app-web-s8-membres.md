# Plan : S8, un propriétaire gère les membres et les invitations

**Story** : #210
**Statut** : Actif

## But

Un propriétaire invite, change un rôle ou retire un membre depuis l'app web, et un invité accepte son invitation (ADR 0017, ADR 0044).

## Ce que l'API sert

- `POST /v1/spaces/:spaceId/invitations` `{ email }` : 201 `{ id, email, expiresAt }`, permis par `member.invite`.
  - 404 : espace inconnu ou hors des espaces du membre.
  - 403 « Accès refusé » : le membre n'a pas `member.invite`.
  - 403 `https://dezyn.dev/problems/plan-required`.
  - 409 « Déjà membre de l'espace ».
  - 503 « Email d'invitation non envoyé ».
- L'email d'invitation mène à `WEB_URL/invitations/:token`.
- `POST /v1/invitations/:token/accept` : l'espace rejoint, de la forme `MySpaceOutput`.
  - 410 « Invitation expirée ou déjà utilisée ».
  - 403 « Invitation adressée à un autre email ».
  - 409 « Déjà membre de l'espace ».
  - 403 `plan-required`.
- `PATCH /v1/spaces/:spaceId/members/:memberId` `{ role }` : `{ userId, role }`, permis par `member.manage`.
  - 409 `https://dezyn.dev/problems/last-owner`.
- `DELETE /v1/spaces/:spaceId/members/:memberId` : 204, permis par `member.manage`.
  - 409 `https://dezyn.dev/problems/self-removal`.
- La liste des membres d'un espace arrive avec la tranche 2.

## Critères d'acceptation

- [ ] Un éditeur qui tente d'inviter reçoit `forbidden`.
- [ ] Une invitation acceptée ajoute le membre.

## Tranches

Chaque tranche suit RED, GREEN, MUTATE, KILL MUTANTS, REFACTOR. Une PR par tranche.

### Tranche 1 : les sorties des invitations et des membres vivent dans `@repo/contracts`

**Valeur** : l'app web et l'API lisent les mêmes formes d'invitations et de membres (ADR 0044 §4).
**Chemin** : `@repo/contracts` décrit les sorties → les tests d'intégration de l'API valident leurs réponses avec ces schémas.

### Tranche 1 bis : « autre email » et « déjà membre » ont leur propre `type`

**Valeur** : le web distingue ces refus d'un « Accès refusé » ou d'un refus d'`Origin` sans lire le titre.
**Chemin** : l'API répond `https://dezyn.dev/problems/email-mismatch` et `https://dezyn.dev/problems/already-member`.

### Tranche 2 : l'API liste les membres d'un espace

**Valeur** : l'app sait qui changer de rôle ou retirer.
**Chemin** : `GET /v1/spaces/:spaceId/members` → `{ members: [{ userId, email, role }] }`, permis par `space.read`.

### Tranche 3 : un invité accepte son invitation

**Valeur** : une invitation acceptée ajoute le membre.
**Chemin** : page `/invitations/$token` → `acceptInvitation` → l'espace rejoint.

### Tranche 4 : un propriétaire invite un membre par email

**Valeur** : le propriétaire fait entrer quelqu'un dans son espace.
**Chemin** : formulaire sur `/espaces/$spaceId`, visible avec `member.invite` → `inviteMember`.

### Tranche 5 : le membre voit les membres de l'espace

**Valeur** : le membre sait qui partage l'espace et avec quel rôle.
**Chemin** : `listMembers` → liste sur `/espaces/$spaceId`.

### Tranche 6 : un propriétaire change le rôle d'un membre

**Valeur** : le propriétaire ajuste les droits d'un membre.
**Chemin** : `changeRole` depuis la liste des membres → la liste est relue.

### Tranche 7 : un propriétaire retire un membre

**Valeur** : le propriétaire fait sortir quelqu'un de son espace.
**Chemin** : `removeMember` depuis la liste des membres → la liste est relue.

## Hors périmètre

- Quitter un espace (`DELETE …/members/me`).
- Revenir sur l'invitation après la connexion : un invité sans session est renvoyé vers `/connexion` et rouvre le lien de l'email.

## Avant chaque PR

1. Stryker sur les fichiers modifiés.
2. Évaluation du refactoring.
3. `pnpm lint`, `pnpm check-types`, tests.

## Décisions

- Un éditeur qui invite reçoit 403 « Accès refusé » : le web le lit en `forbidden`, et le critère « `not_found` » de #210 devient `forbidden`.
- La liste des membres est permise par `space.read` : un éditeur voit aussi les membres.
- Les refus qui partagent un statut reçoivent un `type` propre, comme dans S6.

---

_Supprimer ce fichier quand le plan est terminé._
