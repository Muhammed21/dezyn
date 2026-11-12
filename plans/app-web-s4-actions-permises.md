# Plan : S4, l'app ne propose que les actions permises

**Story** : #206 (DEZ-102)
**Statut** : Actif

## But

L'app web propose à un membre seulement les actions que son rôle lui permet, sans recalculer aucun droit : l'API envoie `allowedActions` sur chaque espace, calculé par `can()` (ADR 0044, ADR 0017).

## Critères d'acceptation

- [ ] Un éditeur reçoit `proposal.review` sans `member.invite` ; un propriétaire reçoit les deux.
- [ ] Le champ est rétrocompatible pour le MCP : les champs existants de `list_spaces` ne changent pas.
- [ ] Sur la page d'un espace, un éditeur ne voit pas le formulaire de création de projet ; un propriétaire le voit.

## Tranches

Chaque tranche suit RED, GREEN, MUTATE, KILL MUTANTS, REFACTOR. Aucun code de production sans test qui échoue.

### Tranche 1 : l'API envoie `allowedActions` sur chaque espace

**Valeur** : un client de l'API (app web, IA par MCP) sait ce que le membre peut faire dans chaque espace, sans connaître les règles des rôles.
**Chemin** : `GET /v1/spaces`, `GET /v1/spaces/:spaceId` et l'outil MCP `list_spaces` → le domaine `space` dérive les actions du rôle avec `can()` → la réponse porte `allowedActions`. Le contrat `@repo/contracts` décrit le champ.
**Critères d'acceptation** :

- Un propriétaire reçoit les 8 actions de `can()`, dont `project.create`, `member.invite` et `proposal.review`.
- Un éditeur reçoit `proposal.review` sans `member.invite`, `member.manage` ni `project.create`.
- La liste suit l'ordre fixe des actions du domaine, pour une réponse stable.
- `GET /v1/spaces/:spaceId` porte le même champ que l'espace dans la liste.
- `list_spaces` (MCP) garde `id`, `name`, `plan` et `role` inchangés et ajoute `allowedActions`. Son `outputSchema` reste valide (`checkOutputSchema`).
- Le contrat accepte une action que le client ne connaît pas encore (`openEnum`), comme `plan` et `role`.
  **RED** : tests du domaine (actions par rôle, ordre), tests d'intégration des deux routes et de l'outil MCP, test du contrat (action inconnue acceptée, conventions respectées).
  **GREEN** : une liste ordonnée des actions dans le domaine, filtrée par `can()` pour le rôle du membre ; le champ ajouté aux espaces renvoyés.
  **Fini quand** : critères prouvés, rapport Stryker relu, commit approuvé.

### Tranche 2 : la page d'un espace cache la création de projet à qui ne peut pas créer

**Valeur** : un éditeur ne se voit plus proposer une action que l'API refuserait.
**Chemin** : `main.tsx` injecte dans la page des projets la lecture d'un espace du module `space` (`GET /v1/spaces/:spaceId`, règle `module-boundaries`) → le formulaire s'affiche seulement si `allowedActions` contient `project.create`.
**Critères d'acceptation** :

- Propriétaire : le formulaire « Créer le projet » est affiché.
- Éditeur : le formulaire est absent ; la liste des projets reste affichée.
- Pendant la lecture de l'espace, ou si elle échoue : le formulaire est absent (on ne propose pas une action incertaine) ; la liste des projets reste affichée.
- Une action inconnue de l'app est ignorée.
- Contre la vraie API : un éditeur invité lit l'espace sans `project.create`.
  **RED** : tests navigateur de la page (propriétaire, éditeur, chargement, échec), tests unitaires de la lecture d'un espace, test d'intégration contre la vraie API.
  **GREEN** : `readSpace` dans le module `space`, un domaine `Space` qui porte ses actions permises, la page qui les consulte.
  **Fini quand** : critères prouvés, rapport Stryker relu, commit approuvé.

## Hors périmètre

- Les autres actions (inviter, gérer les membres, revoir une proposition) : l'app web ne les propose pas encore. Elles liront le même champ quand elles arriveront.
- Aucun droit n'est recalculé côté web ; l'API reste seule juge de chaque requête.

## Avant chaque PR

1. Stryker sur les fichiers modifiés.
2. Évaluation du refactoring.
3. `pnpm lint`, `pnpm check-types`, tests.

---

_Supprimer ce fichier quand le plan est terminé._
