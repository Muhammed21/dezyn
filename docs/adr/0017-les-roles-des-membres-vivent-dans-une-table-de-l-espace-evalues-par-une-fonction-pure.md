# 0017 — Les rôles des membres vivent dans une table de l'espace et sont évalués par une fonction pure

- Statut : Accepté — §2 (raisons de fermeture) complété par [0031](0031-un-membre-retire-par-un-proprietaire-est-ferme-avec-la-raison-removed.md)
- Date : 2026-10-15
- Décideurs : Muhammed

## Contexte et problématique

Un espace possède les projets et porte le plan ; ses membres sont propriétaires ou éditeurs (ADR 0011 §3). Un espace Free n'a qu'un membre (ADR 0011 §4) et un espace a toujours au moins un propriétaire (ADR 0011 §5). Un membre qui quitte un espace reste nommé dans l'historique (ADR 0015 §2).

L'authentification vient de better-auth (ADR 0008), qui propose un plugin `organization` : organisations, membres, invitations et contrôle d'accès. Le projet `twitch` du même auteur évalue ses permissions avec CASL à partir d'une table d'attributions maison.

Chaque route d'API et chaque outil MCP doivent savoir ce que peut faire l'utilisateur authentifié dans un espace (ADR 0007 §3).

Problématique : où vivent les membres et leurs rôles, et comment évalue-t-on ce qu'un membre peut faire ?

## Facteurs de décision

- Le vocabulaire du domaine : espace, membre, propriétaire, éditeur (`CONTEXT.md`).
- Les règles de l'ADR 0011 (un membre en Free, dernier propriétaire) appliquées dans les use-cases, pas dans des hooks d'une bibliothèque.
- La règle d'autorisation testable sans base, en fonction pure (style fonctionnel du dépôt, ADR 0008).
- Deux rôles et une seule portée, l'espace.
- Le départ d'un membre conservé pour l'historique (ADR 0015 §2).

## Options envisagées

### Option A — Table maison et fonction pure

Une table des membres de l'espace, avec le rôle et les dates d'arrivée et de départ. Une fonction pure dit si un membre peut faire une action.

- Avantage : le schéma et les noms suivent le domaine.
- Avantage : les règles se testent sans base ni bibliothèque.
- Inconvénient : les invitations sont à construire.
- **Retenue.**

### Option B — Plugin `organization` de better-auth

- Avantage : membres, invitations et rôles fournis.
- Inconvénient : son schéma et ses rôles (`owner`, `admin`, `member`) sont imposés, à l'écart du vocabulaire du domaine.
- Inconvénient : les règles de l'ADR 0011 passent par des hooks du plugin.
- **Écartée.**

### Option C — Table maison et CASL, comme `twitch`

- Avantage : modèle déjà éprouvé dans `twitch`, expressif.
- Inconvénient : lourd pour deux rôles et une seule portée.
- **Écartée.**

## Décision

### 1. Les membres vivent dans une table de l'espace

Une ligne par membre et par espace : l'espace, l'utilisateur, le rôle (`owner` ou `editor`), la date d'arrivée, la date de fermeture (`closed_at`) et la raison de fermeture (`closed_reason`). La ligne n'est jamais supprimée.

### 2. Un seul membre actif par utilisateur et par espace

Un utilisateur a au plus une ligne ouverte dans un espace. Un départ ferme la ligne avec la raison `left`. Un changement de rôle ferme la ligne avec la raison `role_changed` et en ouvre une nouvelle.

### 3. Une fonction pure dit ce que peut faire un membre

`can({ membership, action })` reçoit le membre actif (ou son absence) et une action, et répond oui ou non. Elle ne lit ni la base ni l'horloge.

### 4. Les invariants de l'espace vivent dans les use-cases

« Un seul membre en Free » et « au moins un propriétaire » sont vérifiés par les use-cases qui ajoutent, changent ou retirent un membre, dans la même transaction que l'écriture.

### 5. Le membre est lu par requête, sans cache

Chaque requête lit le membre actif de l'utilisateur dans l'espace concerné. Aucun cache n'est ajouté tant qu'une mesure ne le demande pas.

## Conséquences

### Positives

- Le modèle de données parle le langage du domaine.
- Les règles d'autorisation se testent en unitaire, sans base.
- L'historique retrouve le rôle d'un membre à toute date grâce aux lignes fermées.

### Négatives

- Les invitations (création, envoi, acceptation, expiration) sont à écrire.
- Une ligne par changement de rôle : la table grossit avec les changements, pas seulement avec les membres.

### Risques et mitigations

- **Deux requêtes simultanées retirent les deux derniers propriétaires** : le use-case verrouille les membres de l'espace (`SELECT … FOR UPDATE`) avant de vérifier l'invariant.
- **Un changement de rôle s'affiche comme un départ** (ADR 0015 §2) : seule une ligne fermée avec la raison `left` est un départ, y compris pour un membre parti puis réinvité.
- **Une route oublie de vérifier l'autorisation** : chaque use-case reçoit le membre et appelle `can` ; un test d'intégration par route vérifie le refus d'un non-membre.

## Notes d'implémentation

- Index unique partiel sur `(space_id, user_id) WHERE closed_at IS NULL`, index sur `(user_id) WHERE closed_at IS NULL`.
- `can` vit dans le domaine du module espace ; les autres modules l'atteignent par son `contracts/` (ADR 0020).
- Repris de `twitch` : la règle d'autorisation séparée de la lecture des rôles, et un port de lecture avec une version en mémoire pour les tests (`AuthzContext`, `inMemoryAuthzContext`). Ni CASL, ni Redis, ni horloge dans la règle.

## Liens

- [ADR 0008](0008-hono-pour-le-backend-better-auth-pour-l-authentification.md) — better-auth authentifie, cet ADR autorise.
- [ADR 0011](0011-l-espace-possede-les-projets-et-porte-le-plan.md) — rôles et invariants de l'espace.
- [ADR 0015](0015-l-historique-garde-les-actions-d-un-compte-supprime-sous-un-membre-supprime.md) — un membre parti reste nommé.
- [ADR 0020](0020-modules-et-couches-de-l-api-imposes-par-des-regles-oxlint.md) — `can` est exposé par le module espace.
