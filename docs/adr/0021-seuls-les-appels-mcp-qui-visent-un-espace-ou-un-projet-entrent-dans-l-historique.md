# 0021 — Seuls les appels MCP qui visent un espace ou un projet entrent dans l'historique

- Statut : Accepté — §1 (appel qui ne vise que l'espace) remplacé par [0025](0025-l-historique-appartient-au-projet-un-espace-n-en-a-pas.md)
- Date : 2026-10-15
- Décideurs : Muhammed
- Amende : ADR 0004 (§1 : seuls les appels d'outil MCP qui visent un espace ou un projet sont journalisés)

## Contexte et problématique

Chaque appel d'outil MCP, lecture comme écriture, laisse une entrée dans l'historique (ADR 0004 §1). L'historique est la chronologie de ce que l'IA et les membres ont fait dans un projet (`CONTEXT.md`).

À la suppression d'un compte, l'auteur de ses entrées devient un membre supprimé dont le numéro est propre à chaque espace (ADR 0015 §1 et §3). Une entrée référence son auteur (ADR 0015, notes d'implémentation ; ADR 0019 §4).

Certains outils ne visent aucun espace : `whoami` renvoie l'utilisateur connecté, `list_spaces` liste ses espaces. Leur entrée n'aurait ni espace pour numéroter son auteur après suppression du compte, ni projet où apparaître.

Décision prise lors de la revue de la branche `docs/adr-socle-api`, le 2026-10-15.

Problématique : un appel d'outil MCP qui ne vise ni un espace ni un projet entre-t-il dans l'historique ?

## Facteurs de décision

- L'historique reste la chronologie d'un projet, lisible par un membre de son espace.
- Toute entrée a un auteur pseudonymisable selon l'ADR 0015 §3.
- Ce que fait l'IA dans un projet reste entièrement tracé (ADR 0004).

## Options envisagées

### Option A — Seuls les appels qui visent un espace ou un projet entrent dans l'historique

- Avantage : chaque entrée appartient à un espace, donc son auteur se numérote par espace après suppression du compte.
- Avantage : l'historique garde le sens que lui donne `CONTEXT.md`.
- Inconvénient : les appels de découverte (`whoami`, `list_spaces`) ne sont pas tracés dans l'historique.
- **Retenue.**

### Option B — Tous les appels entrent dans l'historique, avec un auteur hors espace

- Avantage : l'ADR 0004 §1 s'applique sans exception.
- Inconvénient : il faut un auteur hors espace et une règle de pseudonymisation propre, à l'écart de l'ADR 0015 §3.
- Inconvénient : ces entrées n'apparaissent dans l'historique d'aucun projet.
- **Écartée.**

## Décision

### 1. Un appel qui vise un espace ou un projet laisse une entrée

Un appel d'outil MCP dont l'entrée désigne un espace ou un projet laisse une entrée dans l'historique, lecture comme écriture, qu'il réussisse ou échoue. L'entrée porte l'espace et, s'il y a lieu, le projet.

### 2. Un appel qui ne vise ni espace ni projet n'en laisse pas

`whoami`, `list_spaces` et tout outil qui ne désigne ni espace ni projet ne laissent pas d'entrée dans l'historique. Ils passent par les logs de requête, avec l'identifiant de corrélation.

## Conséquences

### Positives

- Toute entrée a un espace, et son auteur se pseudonymise selon l'ADR 0015 §3.
- Un membre lit dans l'historique tout ce que l'IA a fait dans ses projets.

### Négatives

- L'humain ne voit pas dans l'historique les appels de découverte de l'IA.
- Chaque outil MCP doit déclarer s'il vise un espace ou un projet.

### Risques et mitigations

- **Un outil qui vise un projet est déclaré comme ne visant rien et échappe à l'historique** : un test parcourt les outils enregistrés et vérifie que tout outil dont le schéma d'entrée contient un identifiant d'espace ou de projet passe par l'enveloppe de l'historique.

## Liens

- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — §1 amendé.
- [ADR 0015](0015-l-historique-garde-les-actions-d-un-compte-supprime-sous-un-membre-supprime.md) — le numéro d'un membre supprimé est propre à chaque espace.
- [ADR 0019](0019-l-historique-est-en-ajout-seul-pour-l-app-la-purge-passe-par-un-role-dedie.md) — une entrée référence son auteur.
