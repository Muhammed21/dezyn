# 0032 — Le stockage d'un projet se compte par un compteur d'octets tenu à chaque écriture

- Statut : Proposé
- Date : 2026-10-22
- Décideurs : Muhammed

## Contexte et problématique

Le plan Free donne 500 Mo de stockage, le plan Team 20 Go (ADR 0006 §1). La limite s'applique par espace, et le stockage se mesure par projet puis se cumule par espace (ADR 0011). À 80 % de la limite, la plateforme alerte ; à la limite, elle purge en commençant par le projet qui consomme le plus (ADR 0006 §4, ADR 0016). L'issue #32 fixe les destinataires : les propriétaires de l'espace reçoivent l'alerte par email.

Un projet stocke ses tokens (valeurs par mode, états Figma), ses propositions et ses lots, et ses entrées d'historique ; les images de snapshots s'y ajoutent avec l'ADR 0005. Aucun code ne mesure encore ce stockage. Rien n'ordonnance de tâche périodique dans l'API : un ordonnanceur attend l'hébergeur.

Problématique : comment se compte le stockage d'un projet, et quand part l'alerte à 80 % ?

## Facteurs de décision

- L'utilisateur paie une limite : le chiffre qu'on lui montre ne se trompe pas d'un facteur 2.
- La purge a besoin du stockage de chaque projet au moment où elle s'exécute (ADR 0016).
- Le MCP n'est jamais bloqué, ni par la limite ni par l'alerte (ADR 0006 §4).
- La règle de taille se teste sans base.
- Aucune tâche périodique ne tourne dans l'API.

## Options envisagées

### Ce que la mesure compte

#### Option A — Tout ce que le projet stocke

- Avantage : la limite reflète le coût réel ; l'historique (ADR 0004) et les images (ADR 0005) comptent, comme le disent leurs ADR.
- **Retenue.**

#### Option B — Ce que la purge peut supprimer

- Inconvénient : la limite de 500 Mo ne correspond plus au coût du plan.
- **Écartée.**

#### Option C — L'historique seul

- Inconvénient : le compte est à revoir à l'arrivée des snapshots.
- **Écartée.**

### Comment se mesure le stockage

#### Option D — Un calcul à la demande en SQL

- Avantage : aucun chemin d'écriture touché.
- Inconvénient : le coût du calcul croît avec les données, à chaque vérification.
- **Écartée.**

#### Option E — Un compteur d'octets par projet

- Avantage : une lecture immédiate, au moment où la purge et l'alerte en ont besoin.
- Inconvénient : chaque chemin d'écriture le tient à jour ; un oubli le fait dériver.
- **Retenue.**

#### Option F — Une estimation par nombre de lignes

- Inconvénient : peut se tromper d'un facteur 2 sur une limite payée.
- **Écartée.**

### Combien compte une écriture

#### Option G — La taille UTF-8 du JSON stocké

- Avantage : un calcul pur, dans le domaine, testé sans base ; une même écriture compte toujours la même taille.
- Inconvénient : l'en-tête des lignes et les index de PostgreSQL ne comptent pas ; la limite porte sur les données utiles.
- **Retenue.**

#### Option H — La taille de la ligne en base (`pg_column_size`)

- Inconvénient : un aller-retour de plus par écriture, une règle liée à PostgreSQL, une relecture avant chaque suppression.
- **Écartée.**

#### Option I — Une taille fixe par sorte de ligne

- Inconvénient : l'estimation de l'option F.
- **Écartée.**

### Qui tient le compteur à jour

#### Option J — Un port `StorageMeter` appelé dans chaque transaction d'écriture

- Avantage : la règle de taille reste dans le domaine.
- Inconvénient : un chemin d'écriture futur doit penser à l'appeler.
- **Retenue.**

#### Option K — Un trigger PostgreSQL par table

- Avantage : aucun chemin ne peut oublier le compteur.
- Inconvénient : la taille devient celle de la ligne, colonnes techniques comprises, et la règle vit en SQL.
- **Écartée.**

#### Option L — Un port et un recalcul périodique

- Inconvénient : rien ne lance un recalcul périodique dans l'API.
- **Écartée.**

### Quand part l'alerte à 80 %

#### Option M — Décidée dans la transaction, envoyée après le commit

- Avantage : l'écriture n'attend ni ne dépend du serveur SMTP.
- Inconvénient : un email qui échoue est perdu.
- **Retenue.**

#### Option N — Envoyée dans la transaction

- Inconvénient : une écriture MCP garde ses verrous pendant l'envoi, et un échec SMTP la fait échouer.
- **Écartée.**

#### Option O — Une table d'envois en attente

- Inconvénient : demande un processus qui relit la table.
- **Écartée.**

### Une limite qui change sans écriture

#### Option P — « Au-dessus de 80 % et pas encore alerté », évalué à chaque écriture

- Avantage : un espace repassé en Free au-dessus du seuil est alerté à sa prochaine écriture.
- **Retenue.**

#### Option Q — Une évaluation au changement de plan

- Inconvénient : un chemin de plus, pour un espace qui n'a rien écrit.
- **Écartée.**

#### Option R — Le franchissement seul

- Inconvénient : un espace repassé en Free au-dessus du seuil n'est jamais alerté.
- **Écartée.**

## Décision

### 1. Tout ce qu'un projet stocke compte dans son stockage

Les tokens, leurs valeurs et leurs états Figma, les propositions et les lots, les entrées d'historique, puis les images de snapshots comptent. Le stockage d'un espace est la somme de celui de ses projets.

### 2. Une écriture compte la taille UTF-8 de ce qu'elle stocke, sérialisé en JSON

Le domaine calcule la taille d'une ligne écrite. Une insertion l'ajoute, une suppression la retire, un remplacement ajoute la nouvelle taille et retire l'ancienne. Une image de snapshot compte sa taille en octets.

### 3. Un compteur par projet, tenu par le port `StorageMeter`

Le projet porte son compteur d'octets. `project/contracts` déclare le port `StorageMeter` ; chaque infrastructure qui écrit les données d'un projet l'appelle dans la transaction de son écriture, avec la taille calculée par le domaine.

### 4. L'alerte part quand l'espace est au-dessus de 80 % et pas encore alerté

L'écriture qui laisse l'espace à 80 % ou plus de sa limite, alors que `storage_alerted_at` est vide, pose `storage_alerted_at` dans sa transaction. Après le commit, chaque propriétaire dont la ligne est ouverte reçoit un email. Un échec d'envoi est journalisé, sans nouvel essai, et ne fait jamais échouer l'écriture. Quand le stockage repasse sous 80 %, `storage_alerted_at` redevient vide.

### 5. L'email nomme ce qui va se passer

L'email, en français, donne le nom de l'espace, le stockage consommé et la limite, le projet qui consomme le plus, et ce qui se passe à 100 % : la purge des plus anciennes images de snapshots puis de l'historique, sans blocage du MCP. En Free, il mentionne les 20 Go du plan Team.

## Conséquences

### Positives

- La purge et l'alerte lisent le stockage de chaque projet sans le recalculer.
- Une même écriture compte toujours la même taille, testée sans base.
- Une écriture ne dépend jamais du serveur SMTP.
- Un espace repassé en Free au-dessus du seuil est alerté.

### Négatives

- Chaque chemin qui écrit les données d'un projet appelle `StorageMeter`, y compris la purge et la suppression d'entrées d'historique.
- La limite porte sur les données utiles : le disque réel la dépasse d'un facteur constant.
- Un email d'alerte qui échoue n'est pas renvoyé ; le propriétaire l'apprend à la purge.

### Risques et mitigations

- **Un chemin d'écriture oublie `StorageMeter`, et le compteur dérive** : un test d'intégration par chemin d'écriture compare le compteur à la somme des tailles des lignes du projet.
- **Deux écritures simultanées franchissent le seuil ensemble** : l'écriture verrouille la ligne de l'espace avant de lire `storage_alerted_at`, comme les autres invariants de l'espace (ADR 0017 §4).
- **Une écriture du compteur par écriture de données ralentit les écritures en masse** : une écriture en lot (`write_tokens`) appelle `StorageMeter` une fois avec la somme des tailles.

## Notes d'implémentation

1. Une migration ajoute la colonne du compteur au projet (défaut `0`) et `storage_alerted_at` à l'espace, avec leurs `GRANT UPDATE` pour le rôle `app`.
2. La taille d'une ligne se calcule comme `MAX_EXTENSIONS_BYTES` se vérifie déjà : `TextEncoder` sur le JSON de la valeur.
3. L'email réutilise le mailer des invitations.

## Liens

- [ADR 0006](0006-plans-free-et-team-mcp-complet-dans-tous-les-plans.md) — les limites de stockage, l'alerte à 80 % et la purge (§4).
- [ADR 0011](0011-l-espace-possede-les-projets-et-porte-le-plan.md) — la limite par espace, mesurée par projet.
- [ADR 0016](0016-la-purge-d-un-espace-commence-par-le-projet-qui-consomme-le-plus.md) — la purge lit le stockage de chaque projet.
- [ADR 0017](0017-les-roles-des-membres-vivent-dans-une-table-de-l-espace-evalues-par-une-fonction-pure.md) — les invariants de l'espace se vérifient sous verrou de sa ligne.
