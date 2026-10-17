# Plan : Espaces et membres

**Branche** : feat/espaces-et-membres
**Statut** : Actif
**ADR** : 0011, 0015, 0017, 0020, 0021, 0023, 0027

## Objectif

Chaque utilisateur a un espace personnel dont il est propriétaire, et un propriétaire d'un espace Team y fait entrer des éditeurs, dans le respect des invariants de l'ADR 0011.

## Critères d'acceptation

- [ ] À l'inscription, l'utilisateur reçoit un espace personnel Free dont il est propriétaire.
- [ ] Un utilisateur liste les espaces dont il est membre, par l'API et par le MCP.
- [ ] Un non-membre ne voit pas un espace (404).
- [ ] Un propriétaire d'un espace Team invite un éditeur, qui accepte et devient membre.
- [ ] Un espace Free refuse toute invitation.
- [ ] Le dernier propriétaire ne quitte pas l'espace.
- [ ] Un membre qui quitte l'espace garde sa ligne, fermée avec la raison `left`.

## Tranches

Chaque tranche suit RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR.

### Tranche 1 : à l'inscription, l'utilisateur reçoit son espace personnel et le voit dans sa liste

**Valeur** : un nouvel utilisateur a tout de suite un endroit où créer ses projets.
**Chemin** : hook `user.create.after` de better-auth → use-case `createPersonalSpace` (module `space`) → tables `space` et `space_member` → `GET /v1/spaces` et outil MCP `list_spaces` appellent le même use-case `listMySpaces`. `list_spaces` ne vise aucun espace : il ne laisse pas d'entrée d'historique (ADR 0021 §2).
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`, `functional`.
**Critères d'acceptation** :

- Après inscription, `GET /v1/spaces` renvoie un espace, plan Free, rôle `owner`.
- `list_spaces` renvoie la même liste.
- L'inscription et la création de l'espace réussissent ou échouent ensemble.

**RED** : test d'intégration inscription puis liste par l'API et par le MCP ; test de l'échec de la création d'espace. Mutants attendus : rôle et plan par défaut.
**GREEN** : schéma Drizzle `space` et `space_member` (`closed_at`, `closed_reason`, index unique partiel `closed_at IS NULL`), use-cases, route et outil.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 2 : un non-membre ne voit pas un espace

**Valeur** : les projets d'un espace restent privés à ses membres.
**Chemin** : `GET /v1/spaces/:id` → lecture du membre actif → `can({ membership, action: "space.read" })` → 404 si refusé.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Un membre lit l'espace ; un non-membre et un membre parti reçoivent 404.
- `can` est testée en unitaire avec une table action × rôle sur les actions `space.read`, `project.create`, `member.invite` et `member.leave` : `owner` peut toutes ; `editor` peut `space.read` et `member.leave` ; seul `owner` crée un projet ; l'absence de membre ne peut rien.

**RED** : tests unitaires de `can` (pure, sans base) ; test d'intégration du 404. Mutants attendus : une ligne de la table des permissions.
**GREEN** : `can` dans `modules/space/domain`, exposée par `modules/space/contracts`, avec un `MembershipReader` et sa version en mémoire.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 3 : un propriétaire d'un espace Team invite un éditeur par email

**Valeur** : une équipe commence à travailler à plusieurs.
**Chemin** : `POST /v1/spaces/:id/invitations` → `can("member.invite")` → vérification du plan Team → invitation avec jeton haché et expiration → email via Mailpit en local.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Un propriétaire d'un espace Team crée l'invitation ; un éditeur reçoit 403.
- Un espace Free répond 403 problem+json avec un `type` qui nomme le plan requis (ADR 0011 §4).
- L'email part avec un lien à usage unique.

**RED** : tests unitaires de la règle de plan ; test d'intégration avec un espace passé en Team par une fixture (pas de facturation dans ce plan).
**GREEN** : table `space_invitation`, use-case, envoi d'email derrière un port.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 4 : l'invité accepte et devient éditeur

**Valeur** : l'invité accède aux projets de l'espace.
**Chemin** : `POST /v1/invitations/:token/accept` → contrôle de l'expiration et de l'email → ligne `space_member` `editor` ouverte.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Une invitation valide crée un membre éditeur ; réutilisée, elle répond 410.
- Une invitation expirée répond 410.
- Un utilisateur dont l'email diffère de l'invitation reçoit 403.
- Un membre parti puis réinvité retrouve une ligne ouverte, et sa ligne fermée garde la raison `left`.

**RED** : tests unitaires de l'expiration (bornes) ; test d'intégration du parcours et de la réinvitation.
**GREEN** : use-case `acceptInvitation`.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

### Tranche 5 : le dernier propriétaire ne quitte pas l'espace, un autre membre le peut

**Valeur** : un espace n'est jamais orphelin (ADR 0011 §5), et un membre parti reste nommé dans l'historique des projets, avec la mention « a quitté l'espace » tirée de sa ligne fermée avec la raison `left` ; le départ lui-même n'est pas une entrée d'historique (ADR 0025 §3, ADR 0027).
**Chemin** : `DELETE /v1/spaces/:id/members/me` → `can("member.leave")` → transaction, `SELECT … FOR UPDATE` des membres → invariant → ligne fermée avec la raison `left`.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères d'acceptation** :

- Le dernier propriétaire reçoit 409 problem+json.
- Un éditeur qui quitte garde sa ligne, fermée avec la raison `left`, et perd l'accès (404).
- Deux départs simultanés des deux derniers propriétaires laissent au moins un propriétaire.

**RED** : test unitaire de l'invariant ; test d'intégration de concurrence avec deux transactions. Mutants attendus : `< 1` contre `<= 1` sur le compte des propriétaires, la raison de fermeture.
**GREEN** : use-case `leaveSpace`.
**MUTATE** : skill `mutation-testing`, rapport.
**KILL MUTANTS** : renforcer les tests sur les survivants, demander en cas de doute.
**REFACTOR** : si utile.
**Terminé quand** : critères remplis, rapport de mutation relu, commit approuvé.

Changement de rôle (raison `role_changed`) et retrait d'un membre par un propriétaire : à planifier ensuite, sur le même modèle que la tranche 5.

## Barrière avant PR

1. Mutation testing (skill `mutation-testing`).
2. Évaluation du refactoring (skill `refactoring`).
3. `pnpm check-types`, `pnpm lint`, `pnpm fmt:check`.
4. Vocabulaire conforme à `CONTEXT.md` : espace, membre, propriétaire, éditeur.

---

_Supprimer ce fichier quand le plan est terminé._
