# 0031 — Un membre retiré par un propriétaire est fermé avec la raison `removed`, et l'historique le dit parti

- Statut : Accepté
- Date : 2026-10-21
- Décideurs : Muhammed
- Amende : ADR 0017 (§2 : une troisième raison de fermeture, `removed`), ADR 0027 (§2 : la mention « a quitté l'espace » vient d'une ligne fermée avec la raison `left` ou `removed`)

## Contexte et problématique

La table des membres garde, pour chaque ligne fermée, la raison de fermeture (ADR 0017 §1). L'ADR 0017 §2 n'en connaît que deux : `left` pour un départ, `role_changed` pour un changement de rôle. L'historique d'un projet nomme un membre parti avec la mention « a quitté l'espace », lue dans une ligne fermée avec la raison `left` (ADR 0027 §2).

Un propriétaire pourra retirer un membre (issue #57). L'ADR 0027 laisse ouvert, dans ses risques, la raison qui ferme alors la ligne et la mention qui accompagne ce membre dans l'historique ; d'ici là, seul un départ porte la mention.

Problématique : avec quelle raison se ferme la ligne d'un membre retiré par un propriétaire, et que dit l'historique de ce membre ?

## Facteurs de décision

- La table des membres est la seule source du départ (ADR 0027) ; ce qu'elle ne garde pas ne se retrouve plus.
- Le lecteur de l'historique d'un projet veut savoir si l'auteur d'une action est encore membre de l'espace.
- Une décision prise entre membres de l'espace ne s'expose pas dans l'historique de chaque projet sans raison.

## Options envisagées

### Avec quelle raison se ferme la ligne

#### Option A — Une troisième raison, `removed`

- Avantage : la table distingue le membre parti de lui-même et le membre retiré.
- Inconvénient : chaque lecteur de la raison `left` décide s'il compte aussi `removed`.
- **Retenue.**

#### Option B — `left` pour les deux cas

- Avantage : rien ne change pour les lecteurs de la raison.
- Inconvénient : la différence entre un départ et un retrait est perdue, et ne se retrouve plus après coup.
- **Écartée.**

### Que dit l'historique d'un membre retiré

#### Option C — « a quitté l'espace », comme pour un départ

- Avantage : le lecteur apprend que l'auteur n'est plus membre, ce qu'il cherche.
- Avantage : le retrait, décision entre membres, ne s'affiche pas dans l'historique de chaque projet.
- Inconvénient : l'historique ne dit pas qu'un membre a été retiré ; cela ne se lit que dans la table des membres.
- **Retenue.**

#### Option D — « a été retiré de l'espace »

- Avantage : la mention est exacte.
- Inconvénient : expose dans l'historique de chaque projet une décision prise entre membres de l'espace.
- **Écartée.**

#### Option E — Aucune mention

- Inconvénient : un membre retiré apparaît dans l'historique comme s'il était encore membre ; l'information de l'ADR 0027 §1 se perd pour lui.
- **Écartée.**

## Décision

### 1. Un retrait ferme la ligne avec la raison `removed`

Un propriétaire qui retire un membre ferme sa ligne ouverte avec la raison `removed`. La ligne n'est jamais supprimée (ADR 0017 §1). Les raisons de fermeture sont `left`, `removed` et `role_changed`.

### 2. Un membre retiré « a quitté l'espace » dans l'historique

La mention « a quitté l'espace » se lit dans une ligne fermée avec la raison `left` ou `removed`. L'historique ne distingue pas un départ d'un retrait.

## Conséquences

### Positives

- La table des membres garde qui est parti de lui-même et qui a été retiré.
- L'historique d'un projet dit, pour un membre retiré comme pour un membre parti, qu'il n'est plus membre.
- Le retrait ne s'affiche dans aucun historique de projet.

### Négatives

- Tout code qui lit la raison `left` pour dire qu'un membre est parti doit aussi lire `removed`.
- Un lecteur de l'historique ne sait pas qu'un membre a été retiré ; seule la table des membres le dit.

### Risques et mitigations

- **Un lecteur oublie `removed` et affiche un membre retiré comme encore membre** : la règle « parti = fermé avec `left` ou `removed` » vit dans une seule fonction du domaine des membres, que l'historique appelle.
- **Un changement de rôle s'affiche comme un départ** : inchangé, `role_changed` n'est ni un départ ni un retrait (ADR 0017, risques).

## Notes d'implémentation

1. `closed_reason` reste une colonne `text` : `removed` ne demande pas de migration.
2. Le retrait vérifie l'invariant « au moins un propriétaire » sous `SELECT … FOR UPDATE`, comme le départ (ADR 0017 §4).

## Liens

- [ADR 0017](0017-les-roles-des-membres-vivent-dans-une-table-de-l-espace-evalues-par-une-fonction-pure.md) — la table des membres et ses raisons de fermeture (§2), complétées par `removed`.
- [ADR 0027](0027-un-membre-parti-reste-nomme-dans-l-historique-de-chaque-projet-de-l-espace.md) — la mention « a quitté l'espace » (§2), étendue au membre retiré ; tranche son risque sur le retrait.
