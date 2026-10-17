# 0025 — L'historique appartient au projet ; un espace n'en a pas

- Statut : Accepté
- Date : 2026-10-17
- Décideurs : Muhammed
- Amende : ADR 0021 (§1 : seuls les appels d'outil MCP qui visent un projet laissent une entrée ; un appel qui ne vise que l'espace n'en laisse pas), ADR 0019 (§2 : le rôle `history_maintainer` efface aussi l'historique des projets supprimés)

## Contexte et problématique

`CONTEXT.md` définit l'historique comme la chronologie de ce que l'IA et les membres ont fait dans un projet.

L'ADR 0021 §1 fait laisser une entrée aux appels d'outil MCP qui visent un espace ou un projet ; l'entrée porte l'espace et, s'il y a lieu, le projet. Une entrée sans projet n'a pas d'historique où apparaître. La purge se fait projet par projet (ADR 0016) : une entrée sans projet ne serait jamais purgée.

Les actions sur l'espace (inviter un membre, changer son rôle, changer de plan, supprimer un projet) n'ont aucun projet où laisser une entrée.

Le rôle `app` n'a ni `UPDATE` ni `DELETE` sur les entrées de l'historique (ADR 0019 §1), et seul le job de purge, avec le rôle `history_maintainer`, en supprime (ADR 0019 §2). Une suppression en cascade par clé étrangère s'exécute avec les droits du propriétaire de la table et contournerait cette garantie.

Décision prise lors de la séance de domain modeling des 2026-10-16 et 2026-10-17.

Problématique : l'historique appartient-il au projet seul, ou aussi à l'espace, et où vont les actions qui ne visent que l'espace ?

## Facteurs de décision

- L'historique reste la chronologie d'un projet (`CONTEXT.md`).
- Toute entrée apparaît dans un historique et peut être purgée (ADR 0016).
- Toute entrée a un auteur pseudonymisable par espace (ADR 0015 §3).
- Une trace auditable ne demande pas un endroit hors projet.

## Options envisagées

### Portée de l'historique

#### Option A — Historique de l'espace et de ses projets

Chaque entrée appartient à un espace et, éventuellement, à un projet.

- Avantage : les actions sur l'espace (membres, rôles, plan) sont tracées dans dezyn.
- Inconvénient : les entrées d'espace ne sont jamais purgées, la purge se faisant projet par projet (ADR 0016).
- **Écartée** : l'historique appartient à un projet seulement.

#### Option B — Historique par projet seul

- Avantage : chaque entrée appartient à un projet, apparaît dans son historique et suit sa purge.
- Inconvénient : les actions sur l'espace ne sont pas tracées dans l'historique.
- **Retenue.**

### Trace de la suppression d'un projet

#### Option C — Garder une trace auditable hors projet

- Inconvénient : demanderait un endroit hors projet.
- **Écartée.**

#### Option D — L'historique est supprimé avec le projet, la suppression passe par les logs de requête

- Avantage : aucun endroit hors projet.
- Inconvénient : un projet supprimé emporte son audit.
- **Retenue.**

### Effacement de l'historique d'un projet supprimé

#### Option E — Suppression en cascade par clé étrangère

- Avantage : immédiat, rien de plus à exploiter.
- Inconvénient : la cascade s'exécute avec les droits du propriétaire de la table et contourne l'interdiction faite au rôle `app` (ADR 0019 §1).
- **Écartée.**

#### Option F — Suppression en deux temps : l'app marque le projet, le job `history_maintainer` l'efface

- Avantage : l'app ne détruit toujours aucune entrée ; la garantie de l'ADR 0019 tient.
- Inconvénient : un projet supprimé occupe le disque de la plateforme jusqu'au passage du job.
- **Retenue.**

## Décision

### 1. Chaque projet a son propre historique ; un espace n'en a pas

Seuls les appels d'outil MCP et les actions des membres qui visent un projet laissent une entrée dans l'historique. Une entrée porte toujours son projet, et son espace, qui sert à numéroter le membre supprimé (ADR 0015 §3).

### 2. Un appel d'outil MCP qui ne vise que l'espace ne laisse pas d'entrée

Un appel d'outil MCP qui ne vise que l'espace, par exemple lister les projets d'un espace, ne laisse pas d'entrée dans l'historique. Il passe par les logs de requête avec l'identifiant de corrélation, comme `whoami` et `list_spaces` (ADR 0021 §2).

### 3. Les actions sur l'espace n'entrent pas dans l'historique

Inviter un membre, changer son rôle ou changer de plan ne laisse pas d'entrée dans l'historique. La table des membres (ADR 0017 §1) garde les dates d'arrivée et de fermeture et la raison de fermeture ; elle ne dit pas qui a fait l'action. L'auteur n'y est ajouté que si un client demande un audit plus fin.

### 4. Supprimer un projet supprime son historique

L'historique d'un projet est supprimé avec lui. La suppression du projet passe par les logs de requête.

### 5. Un projet se supprime en deux temps

L'app marque le projet comme supprimé : il disparaît aussitôt pour les membres et pour l'IA, et ne compte plus dans les limites du plan, stockage compris, dès qu'il est marqué. Le job de maintenance, avec le rôle `history_maintainer`, efface ensuite l'historique et les données des projets marqués. Le rôle `history_maintainer` sert ainsi à la purge à la limite de stockage (ADR 0016) et à l'effacement des projets supprimés, jamais à l'app qui sert les requêtes.

## Conséquences

### Positives

- Toute entrée appartient à un projet : elle apparaît dans son historique et suit sa purge (ADR 0016).
- Toute entrée porte son espace, et son auteur se pseudonymise selon l'ADR 0015 §3.
- Aucun historique d'espace à stocker, afficher ou purger.

### Négatives

- dezyn ne dit pas qui a invité ou retiré un membre, ni qui a changé son rôle ou le plan.
- La suppression d'un projet n'est tracée que dans les logs de requête, dont la durée de conservation n'est pas celle de l'historique.
- Un projet supprimé emporte son audit.
- L'humain ne voit pas dans l'historique les appels de l'IA qui ne visent que l'espace.
- Un projet supprimé occupe le disque de la plateforme, sans compter dans la limite de l'espace, jusqu'au passage du job de maintenance, et le job a besoin des droits d'effacement sur les données de projet en plus de l'historique.

### Risques et mitigations

- **Un client demande qui a fait une action sur l'espace** : la table des membres garde les dates et la raison de fermeture (ADR 0017 §1) ; l'auteur y est ajouté si un client demande un audit plus fin (§3).
- **Un outil qui vise un projet est déclaré comme ne visant que l'espace et échappe à l'historique** : le test de l'ADR 0021 (risques) vérifie que tout outil dont le schéma d'entrée contient un identifiant de projet passe par l'enveloppe de l'historique.
- **Une lecture ou une écriture atteint un projet marqué supprimé** : les dépôts et les requêtes filtrent les projets marqués ; un test d'intégration vérifie qu'un projet marqué répond comme un projet inexistant.

## Notes d'implémentation

L'outil qui liste les projets d'un espace rejoint `whoami` et `list_spaces` parmi les outils qui ne passent pas par l'enveloppe de l'historique. Le test de l'ADR 0021 (risques) vérifie la présence d'un identifiant de projet, et non plus d'espace ou de projet.

Le job de maintenance de l'ADR 0019 §2 gagne l'effacement des projets marqués supprimés, après la purge à la limite de stockage.

## Liens

- [ADR 0021](0021-seuls-les-appels-mcp-qui-visent-un-espace-ou-un-projet-entrent-dans-l-historique.md) — §1 amendé : un appel qui ne vise que l'espace ne laisse plus d'entrée.
- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — l'historique unique de l'IA et des membres.
- [ADR 0015](0015-l-historique-garde-les-actions-d-un-compte-supprime-sous-un-membre-supprime.md) — l'espace d'une entrée numérote le membre supprimé (§3).
- [ADR 0016](0016-la-purge-d-un-espace-commence-par-le-projet-qui-consomme-le-plus.md) — la purge se fait projet par projet.
- [ADR 0017](0017-les-roles-des-membres-vivent-dans-une-table-de-l-espace-evalues-par-une-fonction-pure.md) — la table des membres garde arrivées, fermetures et raisons.
- [ADR 0019](0019-l-historique-est-en-ajout-seul-pour-l-app-la-purge-passe-par-un-role-dedie.md) — §2 amendé : le rôle `history_maintainer` efface aussi l'historique des projets supprimés.
