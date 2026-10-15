# Suivi des tickets : GitHub

**Type:** reference

Les tickets et les specs de ce dépôt vivent dans les GitHub Issues de `Muhammed21/dezyn`. Toutes les opérations passent par la CLI `gh`.

## Conventions

- **Créer un ticket** : `gh issue create --title "..." --body "..."`. Utiliser un heredoc pour un corps sur plusieurs lignes.
- **Lire un ticket** : `gh issue view <numéro> --comments`, en filtrant les commentaires avec `jq` et en récupérant aussi les labels.
- **Lister les tickets** : `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` avec les filtres `--label` et `--state` adaptés.
- **Commenter un ticket** : `gh issue comment <numéro> --body "..."`
- **Ajouter / retirer un label** : `gh issue edit <numéro> --add-label "..."` / `--remove-label "..."`
- **Fermer** : `gh issue close <numéro> --comment "..."`

Le dépôt se déduit de `git remote -v` ; `gh` le fait seul quand il tourne dans un clone.

## Pull requests comme surface de triage

**PR comme surface de demande : non.** `/triage` lit ce drapeau ; à `oui`, les PR externes sont traitées comme des demandes de fonctionnalité.

À `oui`, les PR passent par les mêmes labels et états que les tickets, avec les équivalents `gh pr` :

- **Lire une PR** : `gh pr view <numéro> --comments` et `gh pr diff <numéro>` pour le diff.
- **Lister les PR externes à trier** : `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`, puis ne garder que les `authorAssociation` `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR` ou `NONE` (écarter `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Commenter / labelliser / fermer** : `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub partage une seule numérotation entre tickets et PR : un `#42` nu peut être l'un ou l'autre. Résoudre avec `gh pr view 42`, puis `gh issue view 42` en repli.

## Quand un skill dit « publier dans le suivi des tickets »

Créer une GitHub issue.

## Quand un skill dit « récupérer le ticket concerné »

Lancer `gh issue view <numéro> --comments`.

## Opérations de wayfinding

Utilisées par `/wayfinder`. La **carte** est un ticket unique, ses tickets **enfants** sont les tâches.

- **Carte** : un ticket unique labellisé `wayfinder:map`, dont le corps porte les sections Notes / Decisions-so-far / Fog. `gh issue create --label wayfinder:map`.
- **Ticket enfant** : un ticket rattaché à la carte comme sub-issue GitHub (`gh api` sur l'endpoint des sub-issues). Là où les sub-issues ne sont pas activées, ajouter l'enfant à une task list dans le corps de la carte et mettre `Part of #<carte>` en tête du corps de l'enfant. Labels : `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Une fois pris, le ticket est assigné au dev qui le mène.
- **Blocage** : les **dépendances natives** des GitHub Issues, la représentation canonique visible dans l'interface. Ajouter un lien avec `gh api --method POST repos/<owner>/<repo>/issues/<enfant>/dependencies/blocked_by -F issue_id=<id-db-du-bloqueur>`, où `<id-db-du-bloqueur>` est l'**id de base de données** numérique du bloqueur (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _pas_ le `#numéro` ni le `node_id`). GitHub expose `issue_dependencies_summary.blocked_by` (bloqueurs ouverts seulement, la barrière réelle). Là où les dépendances ne sont pas disponibles, se replier sur une ligne `Blocked by: #<n>, #<n>` en tête du corps de l'enfant. Un ticket est débloqué quand tous ses bloqueurs sont fermés.
- **Requête de frontière** : lister les enfants ouverts de la carte (`gh issue list --state open`, limité aux sub-issues / à la task list de la carte), écarter ceux qui ont un bloqueur ouvert (`issue_dependencies_summary.blocked_by > 0`, ou un ticket ouvert dans la ligne `Blocked by`) ou un assigné ; le premier dans l'ordre de la carte l'emporte.
- **Prise** : `gh issue edit <n> --add-assignee @me`, première écriture de la session.
- **Résolution** : `gh issue comment <n> --body "<réponse>"`, puis `gh issue close <n>`, puis ajouter un pointeur de contexte (résumé + lien) aux Decisions-so-far de la carte.
