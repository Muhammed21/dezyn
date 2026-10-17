# 0015 — L'historique garde les actions d'un compte supprimé sous un membre supprimé pseudonyme

- Statut : Accepté — §2 (membre qui quitte un espace) remplacé par [0027](0027-un-membre-parti-reste-nomme-dans-l-historique-de-chaque-projet-de-l-espace.md)
- Date : 2026-10-15
- Décideurs : Muhammed
- Amende : ADR 0004 (§5 : l'auteur d'une entrée d'un compte supprimé est un membre supprimé pseudonyme, et non plus un humain identifié), ADR 0011 (l'auteur d'une entrée d'historique d'un compte supprimé est un membre supprimé, et non plus un membre identifié)

## Contexte et problématique

Chaque entrée de l'historique dit qui a agi, l'IA ou un humain identifié (ADR 0004 §5). Chaque appel MCP est rattaché à l'utilisateur qui a autorisé l'accès (ADR 0007 §4) : les entrées de l'IA sont donc, elles aussi, rattachées à un utilisateur.

Un membre peut quitter un espace, ou supprimer son compte ; le dernier propriétaire nomme d'abord un successeur (ADR 0011 §5). Le RGPD donne à chacun un droit à l'effacement de ses données personnelles.

Décision prise lors de la séance de domain modeling du 2026-10-15.

Problématique : que deviennent les entrées d'historique d'un membre qui quitte un espace ou qui supprime son compte ?

## Facteurs de décision

- L'historique sert d'audit, sans trou (ADR 0004 §5).
- Une donnée personnelle n'est pas conservée sans base légale après la suppression d'un compte.
- L'équipe voit encore que plusieurs actions viennent de la même personne.
- L'équipe ne perd pas d'information quand le droit à l'effacement n'est pas en jeu.

## Options envisagées

### À la suppression du compte

#### Option A — Supprimer les entrées

- Inconvénient : trous dans l'audit, contraire à l'ADR 0004.
- **Écartée.**

#### Option B — Conserver le nom

- Inconvénient : donnée personnelle conservée sans base légale.
- **Écartée.**

#### Option C — Conserver les entrées sous un membre supprimé pseudonyme et stable

- Avantage : l'audit reste complet, on voit que les actions viennent de la même personne, sans donnée personnelle.
- **Retenue.**

### Au départ d'un espace

#### Option D — Pseudonymiser dès le départ de l'espace

- Inconvénient : le droit à l'effacement n'est pas en jeu, et l'équipe perd de l'information.
- **Écartée.**

#### Option E — Garder le nom, avec la mention « a quitté l'espace »

- Avantage : l'équipe sait qui a agi et que cette personne n'est plus membre.
- **Retenue.**

## Décision

### 1. À la suppression d'un compte, ses entrées passent à un membre supprimé

À la suppression d'un compte, ses entrées d'historique et celles de l'IA qu'il avait autorisée sont conservées. Leur auteur est remplacé par un membre supprimé, pseudonyme et stable, par exemple « Membre supprimé n°3 » : on voit que ces actions viennent de la même personne, sans donnée personnelle.

### 2. Un membre qui quitte un espace reste nommé

Un membre qui quitte un espace sans supprimer son compte reste nommé dans l'historique de l'espace, avec la mention « a quitté l'espace ». La pseudonymisation n'a lieu qu'à la suppression du compte.

### 3. Le numéro d'un membre supprimé est propre à chaque espace

Le numéro d'un membre supprimé est attribué dans chaque espace où il a agi, et ne dérive d'aucune donnée du compte supprimé. La même personne porte des numéros indépendants d'un espace à l'autre.

## Conséquences

### Positives

- L'historique reste complet après le départ d'un membre ou la suppression de son compte.
- Une personne qui supprime son compte n'est plus nommée dans l'historique.
- L'équipe voit encore quelles actions viennent d'une même personne, même supprimée.
- Les entrées de l'IA suivent l'utilisateur qui l'avait autorisée.

### Négatives

- La suppression d'un compte modifie l'auteur des entrées d'historique de tous les espaces où il a agi.
- L'auteur d'une entrée n'est plus toujours un humain identifié (ADR 0004 §5) : il peut être un membre supprimé.
- L'historique affiche trois formes d'auteur humain : membre, membre qui a quitté l'espace, membre supprimé.

### Risques et mitigations

- **Donnée personnelle dans le contenu d'une entrée** : le §1 remplace l'auteur, pas le contenu ; une entrée qui cite le nom de la personne, ou un appel MCP dont l'IA a transmis une donnée personnelle (ADR 0004, conséquences négatives), la conserve. Le traitement de ce contenu reste un point ouvert.
- **Le pseudonyme permet de retrouver la personne** : le numéro ne dérive d'aucune donnée du compte et ne se recoupe pas d'un espace à l'autre (§3).

## Notes d'implémentation

Une entrée d'historique référence son auteur au lieu de recopier son nom, pour que la suppression d'un compte remplace l'auteur sans réécrire chaque entrée.

## Liens

- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — amende l'auteur d'une entrée (§5) après la suppression d'un compte.
- [ADR 0007](0007-un-seul-backend-api-et-mcp-streamable-http-oauth.md) — les entrées de l'IA sont rattachées à l'utilisateur qui a autorisé l'accès (§4).
- [ADR 0011](0011-l-espace-possede-les-projets-et-porte-le-plan.md) — le départ d'un membre et la suppression de son compte (§5).
