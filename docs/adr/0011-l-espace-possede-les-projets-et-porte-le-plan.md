# 0011 — L'espace possède les projets et porte le plan, ses membres sont propriétaires ou éditeurs

- Statut : Accepté
- Date : 2026-10-15
- Décideurs : Muhammed
- Amende : ADR 0006 (les limites de projets et de stockage et la purge s'appliquent par espace ; le nombre de membres distingue aussi les plans), ADR 0007 (les limites des plans s'appliquent par espace, pas par utilisateur)

## Contexte et problématique

L'ADR 0006 borne « le coût de stockage d'un utilisateur » et l'ADR 0007 pose que « les plans limitent les projets et le stockage par utilisateur ». Or le plan payant s'appelle Team, et plusieurs designers doivent travailler sur les mêmes projets.

Les validations et les modifications humaines entrent dans l'historique, rattachées à un humain identifié (ADR 0004 §4, §5).

Décision prise lors de la séance de domain modeling du 2026-10-15.

Problématique : à qui appartiennent les projets et le plan, et quels droits ont les personnes qui travaillent ensemble sur un même projet ?

## Facteurs de décision

- Plusieurs designers travaillent sur les mêmes projets dans le plan Team.
- Le projet reste l'unité que comptent les plans (ADR 0006).
- Le plan Free pousse vers le plan Team.
- Une équipe ne perd pas son espace quand une personne part.
- Pas de rôle construit avant qu'un client le demande.

## Options envisagées

### Option A — Le projet appartient à l'utilisateur

C'est la lecture des ADR 0006 et 0007 : les limites et les projets sont portés par l'utilisateur.

- Inconvénient : aucun partage de projet entre designers dans le plan Team.
- **Écartée.**

### Option B — Un espace possède les projets et porte le plan

- Avantage : plusieurs membres travaillent sur les mêmes projets, sous un même plan.
- Avantage : un utilisateur seul garde le même modèle, avec un espace personnel.
- **Retenue.**

### Option C — Une direction artistique partagée entre plusieurs projets

- Inconvénient : le projet ne serait plus un design system complet, et l'unité de facturation changerait.
- **Écartée pour l'instant.**

### Option D — Grille de rôles complète dès le départ : propriétaire, éditeur, lecteur

- Inconvénient : un rôle Lecteur que personne n'a encore demandé.
- **Écartée** en attendant une demande client.

### Option E — Rôles propriétaire et éditeur

- Avantage : couvre la gestion du plan et des membres, et le travail sur les projets.
- **Retenue.**

### Option F — Plusieurs membres dans un espace Free

- Inconvénient : rien ne pousse au plan Team, une équipe tient dans 3 projets et 500 Mo.
- **Écartée.**

### Option G — Un seul propriétaire par espace

- Inconvénient : l'équipe perd l'espace si cette personne part.
- **Écartée.**

## Décision

### 1. Un espace possède les projets et porte le plan

Un espace porte un plan, Free ou Team. Les limites de l'ADR 0006 (nombre de projets, stockage, purge à la limite) s'appliquent par espace, pas par utilisateur. Un utilisateur seul a un espace personnel.

### 2. Un projet appartient à un seul espace

Un projet est un design system complet : tokens, composants et décisions. Il n'appartient qu'à un espace. Une direction artistique ne se partage pas entre projets.

### 3. Un membre est propriétaire ou éditeur

- **Propriétaire** : gère le plan et les membres de l'espace, et peut tout ce que peut un éditeur.
- **Éditeur** : modifie les projets de l'espace, valide ou rejette les propositions.

### 4. Un espace Free a un seul membre

Le seul membre d'un espace Free est son propriétaire. Inviter un membre demande le plan Team. Les fonctions restent identiques dans les deux plans (ADR 0006 §2) ; ce qui distingue les plans, ce sont leurs limites de projets, de stockage et de membres.

### 5. Un espace a toujours au moins un propriétaire

Un espace peut avoir plusieurs propriétaires. Le dernier propriétaire ne quitte pas l'espace et ne supprime pas son compte sans avoir nommé un autre propriétaire.

## Conséquences

### Positives

- Plusieurs membres travaillent sur les mêmes projets dans le plan Team.
- Le projet reste l'unité que comptent les plans ; la facturation de l'ADR 0006 garde son unité.
- Inviter un membre est une raison claire de passer au plan Team.
- Chaque action humaine de l'historique est rattachée à un membre identifié d'un espace (ADR 0004 §5).
- Une équipe garde son espace quand un propriétaire part, dès qu'un autre propriétaire est nommé.

### Négatives

- Le modèle compte une entité de plus que l'utilisateur : l'espace, avec ses membres et leurs rôles.
- Un client qui veut donner un simple accès en lecture doit en faire un éditeur, faute de rôle Lecteur.
- Deux projets qui partagent une même direction artistique la dupliquent, chacun avec ses tokens et ses décisions.
- Le départ du dernier propriétaire et la suppression de son compte demandent un parcours de transfert.

### Risques et mitigations

- **Espace orphelin** : un espace sans propriétaire ne peut plus gérer son plan ni ses membres. Mitigation : le dernier propriétaire nomme un successeur avant de partir (§5).
- **Une équipe reste en Free sur un espace partagé** : bornée par la limite d'un membre (§4).
- **Un client demande un accès en lecture seule** : le rôle Lecteur s'ajoute à ce moment, par un nouvel ADR.

## Notes d'implémentation

La création d'un projet vérifie la limite du plan de son espace ; le stockage se mesure par projet et se cumule par espace. L'invitation d'un membre vérifie que l'espace est en plan Team. L'auteur d'une entrée d'historique est un membre (ADR 0004 §5).

## Liens

- [ADR 0006](0006-plans-free-et-team-mcp-complet-dans-tous-les-plans.md) — les limites des plans s'appliquent par espace ; le nombre de membres distingue aussi les plans.
- [ADR 0007](0007-un-seul-backend-api-et-mcp-streamable-http-oauth.md) — les limites des plans s'appliquent par espace, pas par utilisateur authentifié.
- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — chaque action humaine est rattachée à un membre identifié.
- [ADR 0012](0012-les-ecritures-de-l-ia-sont-des-propositions-relues-par-un-editeur.md) — l'éditeur relit les propositions de l'IA.
