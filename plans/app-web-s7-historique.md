# Plan : S7, historique d'un projet

**Story** : #209 (DEZ à retrouver dans le projet Linear « App web : logique et sécurité »)
**Statut** : Brouillon, questions ouvertes à trancher avant la tranche 1

## But

Le membre lit dans l'app web qui a fait quoi dans un projet, et voit quand la purge du stockage a supprimé les plus anciennes entrées (ADR 0042 §6, ADR 0044).

## Existant côté API

- `GET /v1/projects/:projectId/history?cursor=&limit=` : pages des plus récentes aux plus anciennes, `limit` de 1 à 100 (50 par défaut), `nextCursor` opaque, `purgedBefore` (date ISO ou `null`) sur chaque page. Droit `space.read` : propriétaire et éditeur. Non-membre, projet inconnu ou identifiant invalide : 404. Curseur ou `limit` invalide : 400 problem+json.
- Lecture par cookie sur `/v1` (ADR 0044 §1).
- Outil MCP `read_history`, même sortie (`HistoryOutput`), qui trace l'appel `mcp.read_history`.
- Le contrat `HistoryOutput` vit dans `apps/api/src/modules/history/contracts/history.ts`, pas encore dans `@repo/contracts`.
- Le module web `project` lit déjà `historyPurgedAt` de la liste des projets.

## Critères d'acceptation

- [ ] Un historique purgé porte `purgedBefore`.
- [ ] Le membre lit les entrées d'un projet, des plus récentes aux plus anciennes, avec l'auteur et la date.
- [ ] (selon la question 2) Le membre charge les entrées plus anciennes.

## Tranches

Chaque tranche suit RED, GREEN, MUTATE, KILL MUTANTS, REFACTOR. Aucun code de production sans test qui échoue.

### Tranche 1 : le contrat de l'historique passe dans `@repo/contracts`

**Valeur** : l'app web et l'API partagent la forme de l'historique (ADR 0044 §4).
**Chemin** : `HistoryOutput`, `HistoryEntryOutput` et `HistoryAuthor` vont dans `packages/contracts/src/history/`, avec leurs tests ; `read_history` les importe de `@repo/contracts`. Même geste que le contrat des tokens (87280e8).
**Critères d'acceptation** :

- Le contrat garde `entries`, `nextCursor` et `purgedBefore` (date ISO ou `null`) ; un historique purgé porte `purgedBefore`.
- Une action, une appartenance ou un genre d'auteur ajoutés plus tard par le serveur sont acceptés (ADR 0023 §2).
- Le schéma respecte les conventions de sortie (`checkOutputSchema`).
- `read_history` annonce le même schéma de sortie qu'avant.
- La réponse de `GET /v1/projects/:projectId/history` est conforme au contrat (test d'intégration).

### Tranche 2 : le membre lit la première page de l'historique d'un projet

**Valeur** : le membre voit qui a fait quoi, et depuis quand l'historique est complet.
**Chemin** : module web `history` (domaine, passerelle HTTP, cas d'usage `readHistory`, route) → `GET /v1/projects/:projectId/history` → page `/projets/$projectId/historique` (question 1), branchée par `main.tsx`.
**Critères d'acceptation** (à figer après les questions 1, 3 à 7) :

- La page liste les entrées dans l'ordre de l'API, avec l'action, l'auteur et la date.
- Un historique purgé annonce la date avant laquelle les entrées ont été supprimées ; un historique complet n'annonce rien.
- Sans session : retour à la connexion. Projet introuvable ou identifiant invalide : « Ce projet est introuvable. », sans appel à l'API pour un identifiant invalide. API indisponible ou réponse illisible : message d'indisponibilité.
- Contre la vraie API : un propriétaire lit l'historique de son projet ; un non-membre reçoit `not_found`.

### Tranche 3 : le membre charge les entrées plus anciennes

**Valeur** : le membre remonte au-delà des 50 dernières entrées.
**Chemin** : `nextCursor` → page suivante, ajoutée sous les précédentes (question 2).
**Critères d'acceptation** (à figer après la question 2) :

- Sans `nextCursor`, rien n'est proposé.
- Les entrées des pages suivantes s'ajoutent sans perte ni doublon.
- Un échec de la page suivante garde les entrées déjà lues.

## Hors périmètre

- Filtres (reportés par #209).
- Bandeau de purge des éditeurs (#32) : chantier visuel.

## Avant chaque PR

1. Stryker sur les fichiers modifiés.
2. Évaluation du refactoring.
3. `pnpm lint`, `pnpm check-types`, tests.

---

_Supprimer ce fichier quand le plan est terminé._

## Décisions (12/11/2026)

- Page `/projets/$projectId/historique` dans un module `history`, lien depuis la page des tokens.
- Bouton « Entrées plus anciennes » qui ajoute la page suivante (tranche 3).
- Un libellé français par action connue, le code brut pour une action inconnue.
- Chaque entrée montre l'action, l'auteur, la date et l'IA (`clientId`) quand elle a agi ; `before` et `after` attendent le visuel.
- Un auteur inconnu s'affiche « auteur inconnu » ; un membre parti, son nom suivi de « (a quitté l'espace) ».
- Dates absolues `fr-FR` dans le fuseau du navigateur.
- Échecs comme les tokens : `unauthenticated` → connexion ; `not_found` → « Ce projet est introuvable. » ; `unavailable` et `invalid_response` (dont la 400 du curseur) → « L'historique est indisponible pour le moment. »
- La lecture par l'app web n'est pas tracée dans l'historique.
- Pas de `limit` envoyée : l'API en donne 50.
- Trois PR : contrat, première page, entrées plus anciennes.
