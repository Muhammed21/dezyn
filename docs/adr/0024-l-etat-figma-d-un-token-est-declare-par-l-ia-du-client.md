# 0024 — L'état Figma d'un token est déclaré par l'IA du client

- Statut : Accepté
- Date : 2026-10-16
- Décideurs : Muhammed

## Contexte et problématique

Une équipe qui garde Figma comme outil de travail veut savoir, pour chaque token de dezyn, où en est Figma : même valeur, valeur différente, token absent, ou plusieurs variables Figma pour un même token.

La plateforme fait foi pour le design (ADR 0001) et n'appelle jamais l'API Figma (ADR 0003 §1). C'est l'IA du client qui lit Figma avec ses propres accès, et tout ce qu'elle y lit est inscrit dans la plateforme avant sa réponse (ADR 0003 §4). Toute écriture de donnée de design par l'IA est une proposition (ADR 0012 §1).

Problématique : qui établit l'état Figma d'un token, et que devient la valeur trouvée dans Figma quand elle diffère de celle de dezyn ?

## Facteurs de décision

- La plateforme n'appelle pas Figma (ADR 0003 §1).
- La valeur validée dans dezyn fait foi tant qu'un éditeur n'en a pas décidé autrement (ADR 0012 §3).
- Un membre voit l'état Figma sans aller comparer lui-même.

## Options envisagées

### Qui établit l'état Figma

#### Option A — L'IA du client, via le MCP

- Avantage : conforme à l'ADR 0003 ; l'IA lit déjà Figma avec ses accès.
- Inconvénient : l'état n'existe que si une IA a comparé, et il date de cette comparaison.
- **Retenue.**

#### Option B — Un membre, à la main

- Avantage : rien à construire côté MCP.
- Inconvénient : le membre doit comparer lui-même chaque token avec Figma.
- **Écartée.**

#### Option C — L'IA, corrigée par les membres

- Avantage : un membre rattrape une erreur de l'IA.
- Inconvénient : deux sources d'un même état à concilier.
- **Écartée.**

### La déclaration passe-t-elle par la relecture

#### Option D — Elle s'applique tout de suite

- Avantage : l'état est un constat, pas une donnée de design ; la valeur validée ne change pas.
- **Retenue.**

#### Option E — Elle est une proposition à valider

- Inconvénient : un éditeur doit relire chaque constat avant qu'il ne s'affiche.
- **Écartée.**

### Que devient la valeur d'un token divergent

#### Option F — L'IA la propose dans dezyn

- Avantage : conforme à l'ADR 0003 §4 ; l'éditeur tranche entre la valeur de dezyn et celle de Figma.
- **Retenue.**

#### Option G — L'IA déclare seulement l'état

- Inconvénient : contredit l'ADR 0003 §4 ; la valeur de Figma n'arrive jamais devant un éditeur.
- **Écartée.**

## Décision

### 1. L'IA du client déclare l'état Figma

L'état Figma d'un token est déclaré par l'IA du client, via le MCP, après comparaison avec Figma. La déclaration porte sa date et entre dans l'historique (ADR 0021 §1). Un token qu'aucune IA n'a comparé n'a pas d'état Figma.

### 2. Quatre états

Synchronisé, divergent, absent de Figma, doublon dans Figma (`CONTEXT.md`).

### 3. La déclaration s'applique sans relecture

Une déclaration d'état Figma n'est pas une proposition : elle remplace l'état précédent du token dès qu'elle est reçue.

### 4. La valeur d'un token divergent devient une proposition

Quand l'IA déclare un token divergent, elle écrit aussi la valeur trouvée dans Figma, qui devient une proposition (ADR 0003 §4, ADR 0012 §1). Un éditeur la valide, et dezyn adopte la valeur de Figma, ou la rejette, et c'est Figma qui est à corriger.

Quand l'éditeur valide la proposition, l'état Figma du token passe à synchronisé, à la date de la comparaison qui a lu cette valeur. Quand il la rejette, l'état reste divergent.

Une valeur de Figma identique à la dernière valeur rejetée pour ce token ne crée aucune proposition, comme une écriture identique à la valeur validée (ADR 0013 §5). Une valeur de Figma différente crée une nouvelle proposition.

### 5. Le doublon dans dezyn n'est pas un état Figma

Un doublon (`CONTEXT.md`) se détecte dans dezyn, à partir des valeurs validées du projet, sans IA ni Figma.

## Conséquences

### Positives

- La plateforme reste sans client Figma (ADR 0003 §1).
- Une divergence arrive devant un éditeur sous forme de proposition, avec ses deux valeurs.
- L'origine de chaque état se lit dans l'historique.

### Négatives

- L'état Figma peut être périmé : un token modifié dans dezyn ou dans Figma garde l'état de la dernière comparaison.
- Un projet dont l'IA ne compare jamais n'a aucun état Figma.
- dezyn garde, pour chaque token, la dernière valeur de Figma rejetée.
- La validation d'une proposition change l'état Figma sans nouvelle déclaration de l'IA, seule exception au §3.

### Risques et mitigations

- **L'IA déclare un état faux** : l'historique nomme l'IA et l'utilisateur qui l'a déclaré ; une nouvelle comparaison le remplace.
- **Un état périmé passe pour actuel** : l'interface affiche la date de la déclaration à côté de l'état.

## Liens

- [ADR 0001](0001-plateforme-centrale-de-design-plutot-que-pont-figma-code.md) — la plateforme fait foi.
- [ADR 0003](0003-import-export-orchestres-par-les-mcp-du-client.md) — l'IA lit Figma, la plateforme ne l'appelle pas.
- [ADR 0010](0010-tokens-au-format-dtcg-modes-par-le-resolver.md) — un token a une valeur par mode.
- [ADR 0012](0012-les-ecritures-de-l-ia-sont-des-propositions-relues-par-un-editeur.md) — les écritures de l'IA sont des propositions.
- [ADR 0013](0013-lots-de-propositions-declares-par-l-ia-propositions-remplacees-et-ecritures-identiques.md) — une écriture identique ne crée aucune proposition.
- [ADR 0021](0021-seuls-les-appels-mcp-qui-visent-un-espace-ou-un-projet-entrent-dans-l-historique.md) — la déclaration entre dans l'historique.
