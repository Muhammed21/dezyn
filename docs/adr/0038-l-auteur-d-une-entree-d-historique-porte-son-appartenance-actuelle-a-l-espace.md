# 0038 — L'auteur d'une entrée d'historique porte son appartenance actuelle à l'espace, quel que soit le client qui a agi

- Statut : Proposé
- Date : 2026-10-27
- Décideurs : Muhammed Cavus
- Amende : ADR 0027 (risques : le membre parti puis réinvité, et les entrées de l'IA autorisée par un membre parti)

## Contexte et problématique

Un membre qui quitte un espace reste nommé dans l'historique de chaque projet, avec la mention « a quitté l'espace », lue dans la table des membres (ADR 0027). Un membre retiré par un propriétaire porte la même mention (ADR 0031). L'ADR 0027 laisse deux points ouverts dans ses risques : la mention d'un membre parti puis réinvité, et celle des entrées écrites par l'IA qu'un membre parti avait autorisée.

La lecture de l'historique (`GET /v1/projects/:id/history` et `read_history`) rend l'auteur sous la forme `{ kind: "member", userId, name }`, sans la mention (issue #163). Une entrée écrite par l'IA a pour auteur le membre qui l'a autorisée, et nomme le client OAuth dans `clientId`.

La table des membres garde chaque appartenance comme une ligne, fermée avec la raison `left`, `removed` ou `role_changed` (ADR 0017, 0031). Un changement de rôle ferme la ligne et en ouvre une autre dans la même transaction.

Problématique : sous quelle forme l'historique rend-il la mention, et que dit-il d'un membre réinvité et des entrées de l'IA d'un membre parti ?

## Facteurs de décision

- Le lecteur de l'historique veut savoir si l'auteur d'une action est encore membre de l'espace (ADR 0031).
- Les contrats de sortie restent ouverts : un champ ou une valeur ajoutés plus tard ne cassent pas un client (ADR 0023).
- La route et `read_history` rendent la même page (ADR 0007 §3).
- La table des membres est la seule source du départ (ADR 0027 §2).

## Options envisagées

### La forme de la mention

#### Option A — Un booléen sur l'auteur

- Avantage : le plus simple à lire.
- Inconvénient : ne peut dire que « parti » ou « pas parti » ; un autre état demanderait un second champ.
- **Écartée** : ferme la porte à un état de plus sans gain de simplicité réel.

#### Option B — Un état d'appartenance en `openEnum` sur l'auteur

- Avantage : `membership: "active" | "left"` peut gagner une valeur sans casser les clients (ADR 0023).
- Inconvénient : un client doit traiter une valeur inconnue.
- **Retenue.**

#### Option C — Un nouveau `kind` d'auteur

- Avantage : le type de l'auteur dit tout seul qu'il est parti.
- Inconvénient : `kind` distingue des sortes d'auteurs, comme le membre supprimé (ADR 0015). Un membre parti est le même membre, pas une autre sorte d'auteur.
- **Écartée.**

### Le membre parti puis réinvité

#### Option A — L'état actuel

- Avantage : la mention suit la table des membres au moment de la lecture, comme le dit l'ADR 0027 §2. Un membre réinvité redevient `active` sur toutes ses entrées.
- Inconvénient : l'historique ne dit pas qu'un membre est parti un jour.
- **Retenue.**

#### Option B — L'état au moment de l'entrée

- Inconvénient : un membre n'écrit que pendant qu'il est membre, donc chaque entrée serait `active`. La mention ne servirait jamais.
- **Écartée.**

#### Option C — Signaler un départ passé

- Inconvénient : trompeur pour un membre de nouveau présent.
- **Écartée.**

### Les entrées de l'IA autorisée par un membre parti

#### Option A — La même mention

- Avantage : l'appartenance est une propriété de l'auteur, quel que soit le client. L'IA suit son utilisateur, comme à la suppression du compte (ADR 0015 §1).
- **Retenue.**

#### Option B — Pas de mention sur les entrées de l'IA

- Inconvénient : l'historique nommerait un membre parti sans le dire, selon le client qui a agi.
- **Écartée.**

## Décision

### 1. L'auteur porte un état d'appartenance

Un auteur `member` porte `membership`, un `openEnum` qui vaut `"active"` ou `"left"`. Le champ est toujours présent, sur la route comme dans `read_history`.

### 2. L'état est celui de l'auteur au moment de la lecture

`membership` vaut `"left"` quand l'auteur n'a plus de ligne ouverte dans l'espace de l'entrée, et `"active"` sinon. Un changement de rôle rouvre une ligne dans la même transaction : une ligne absente veut donc dire une dernière ligne fermée avec la raison `left` ou `removed` (ADR 0031). Un membre réinvité redevient `active` sur toutes ses entrées.

### 3. L'état ne dépend pas du client

`membership` ne dépend que de l'auteur et de l'espace de l'entrée, jamais de `clientId`. Une entrée de l'IA autorisée par un membre parti porte `"left"`.

## Conséquences

### Positives

- Le front et l'IA du client lisent la mention dans le même champ.
- Les deux points ouverts de l'ADR 0027 sont tranchés.
- Le calcul ne lit pas la raison de fermeture : un code qui oublierait `removed` ne peut pas se tromper (ADR 0031, risques).

### Négatives

- La lecture de l'historique interroge la table des membres pour chaque auteur de la page.
- L'historique ne garde pas trace d'un départ suivi d'un retour.

### Risques et mitigations

- **Un changement de rôle hors transaction laisserait l'auteur sans ligne ouverte** : il passerait pour parti. Mitigation : le changement de rôle ferme et rouvre la ligne dans une seule unité de travail (ADR 0017 §4) ; un test le vérifie à la lecture de l'historique.
- **Un compte supprimé** : la pseudonymisation remplace l'auteur par un membre supprimé (ADR 0015), un autre `kind`, qui ne porte pas `membership`.

## Notes d'implémentation

1. `HistoryAuthor` gagne `membership: openEnum(["active", "left"])` sur la variante `member`.
2. Le lecteur Postgres de l'historique calcule l'état par l'existence d'une ligne ouverte de `space_member` pour `(space_id, user_id)` de l'entrée.
3. Tests : un éditeur parti, un membre retiré, un membre réinvité, un changement de rôle, une entrée de l'IA d'un membre parti.

## Liens

- [ADR 0027](0027-un-membre-parti-reste-nomme-dans-l-historique-de-chaque-projet-de-l-espace.md) — la mention « a quitté l'espace » ; tranche ses deux risques ouverts.
- [ADR 0031](0031-un-membre-retire-par-un-proprietaire-est-ferme-avec-la-raison-removed.md) — un membre retiré porte la même mention.
- [ADR 0023](0023-reponses-ouvertes-enums-ouverts-et-unions-extensibles-dans-les-contrats.md) — `membership` est un `openEnum`.
- [ADR 0015](0015-l-historique-garde-les-actions-d-un-compte-supprime-sous-un-membre-supprime.md) — l'IA suit son utilisateur ; le membre supprimé est un autre `kind`.
- [ADR 0017](0017-les-roles-des-membres-vivent-dans-une-table-de-l-espace-evalues-par-une-fonction-pure.md) — la table des membres et ses lignes fermées.
