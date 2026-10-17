# 0027 — Un membre parti reste nommé dans l'historique de chaque projet de l'espace

- Statut : Accepté
- Date : 2026-10-17
- Décideurs : Muhammed
- Amende : ADR 0015 (§2 : le membre parti reste nommé dans l'historique de chaque projet de l'espace, et non plus dans l'historique de l'espace ; la mention vient de la table des membres)

## Contexte et problématique

L'ADR 0015 §2 garde le nom d'un membre qui quitte un espace sans supprimer son compte « dans l'historique de l'espace », avec la mention « a quitté l'espace ».

L'ADR 0025 établit que l'historique appartient au projet et qu'un espace n'en a pas (§1), et que les actions sur l'espace n'entrent pas dans l'historique (§3). La table des membres garde la date d'arrivée, la date de fermeture et la raison de fermeture ; un départ ferme la ligne avec la raison `left` (ADR 0017 §1 et §2).

L'« historique de l'espace » de l'ADR 0015 §2 n'existe donc plus, et le départ d'un membre, action sur l'espace, n'y laisse pas d'entrée.

Problématique : où l'historique montre-t-il qu'un auteur a quitté l'espace, maintenant qu'un espace n'a pas d'historique ?

## Facteurs de décision

- L'équipe ne perd pas d'information quand le droit à l'effacement n'est pas en jeu (ADR 0015).
- L'historique reste la chronologie d'un projet ; un espace n'en a pas (ADR 0025 §1).
- Les actions sur l'espace n'entrent pas dans l'historique (ADR 0025 §3).
- La table des membres garde déjà le départ, avec la raison `left` (ADR 0017 §2).

## Options envisagées

### Option A — Mention « a quitté l'espace » dans l'historique de chaque projet

Les entrées du membre parti, dans l'historique de chaque projet de l'espace, gardent son nom avec la mention « a quitté l'espace », tirée de la table des membres.

- Avantage : en lisant l'historique d'un projet, l'équipe sait qui a agi et que cette personne n'est plus membre, comme le voulait l'ADR 0015 §2.
- Avantage : le départ n'ajoute aucune entrée ; l'ADR 0025 §3 tient.
- Inconvénient : l'affichage de l'historique dépend de la table des membres de l'espace.
- **Retenue.**

### Option B — Départ visible seulement dans la table des membres

L'historique des projets affiche le nom seul ; le départ ne se lit que dans la table des membres.

- Avantage : l'historique ne lit que ses propres entrées.
- Inconvénient : en lisant l'historique, l'équipe ne sait pas que l'auteur n'est plus membre ; l'information de l'ADR 0015 §2 se perd.
- **Écartée** : l'information doit rester visible là où on lit les actions.

## Décision

### 1. Un membre parti reste nommé dans l'historique de chaque projet de l'espace

Un membre qui quitte un espace sans supprimer son compte reste nommé dans l'historique de chaque projet de l'espace. Ses entrées gardent son nom, avec la mention « a quitté l'espace ».

### 2. La mention vient de la table des membres

La mention « a quitté l'espace » se lit dans la table des membres (ADR 0017 §1) : une ligne fermée avec la raison `left`. Le départ lui-même n'est pas une entrée d'historique (ADR 0025 §3).

### 3. La pseudonymisation n'a lieu qu'à la suppression du compte

Quitter un espace ne pseudonymise rien. Seule la suppression du compte remplace l'auteur par un membre supprimé (ADR 0015 §1 et §3).

## Conséquences

### Positives

- L'historique d'un projet dit qui a agi et si cette personne a quitté l'espace.
- Aucun historique d'espace ni aucune entrée de départ n'est réintroduit.
- La table des membres reste la seule source du départ.

### Négatives

- L'affichage de l'historique d'un projet lit la table des membres de l'espace, en plus des entrées.
- L'historique dit qu'un auteur a quitté l'espace, mais pas quand : la date du départ ne se lit que dans la table des membres.

### Risques et mitigations

- **Un changement de rôle s'affiche comme un départ** : seule une ligne fermée avec la raison `left` est un départ (ADR 0017, risques).
- **Un membre parti puis réinvité** : il a une ligne fermée avec la raison `left` et une ligne ouverte (ADR 0017 §2). Le choix d'afficher ou non la mention dans ce cas reste un point ouvert.

## Notes d'implémentation

Une entrée référence son auteur (ADR 0015, notes d'implémentation) et porte son espace (ADR 0025 §1) : la mention se calcule à la lecture, à partir des lignes de la table des membres de cet espace pour cet utilisateur, sans réécrire d'entrée.

## Liens

- [ADR 0015](0015-l-historique-garde-les-actions-d-un-compte-supprime-sous-un-membre-supprime.md) — §2 amendé : le membre parti reste nommé dans l'historique de chaque projet.
- [ADR 0017](0017-les-roles-des-membres-vivent-dans-une-table-de-l-espace-evalues-par-une-fonction-pure.md) — la table des membres garde le départ, avec la raison `left`.
- [ADR 0025](0025-l-historique-appartient-au-projet-un-espace-n-en-a-pas.md) — l'historique appartient au projet ; les actions sur l'espace n'y entrent pas.
