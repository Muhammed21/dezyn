# 0013 — Lots de propositions déclarés par l'IA, propositions remplacées et écritures identiques

- Statut : Accepté
- Date : 2026-10-15
- Décideurs : Muhammed
- Amende : ADR 0012 (§4 : un lot de propositions est déclaré par l'IA avec une intention, et non délimité par une session ; §1 : une écriture identique à la valeur validée ne crée pas de proposition, et une proposition en attente peut passer au statut Remplacée)

## Contexte et problématique

L'ADR 0012 §4 regroupe en un lot de propositions « les propositions écrites par l'IA au cours d'une même session », sans définir la session. Aucune frontière disponible ne convient :

- une session MCP Streamable HTTP (ADR 0007 §2) est imprévisible : l'app d'IA se reconnecte, et un même import peut se retrouver coupé en plusieurs lots ;
- une autorisation OAuth (ADR 0007 §4) dure des semaines, et ferait un lot géant ;
- la conversation entre l'utilisateur et son IA est invisible pour dezyn.

Une équipe qui garde Figma comme outil de travail fait réécrire dans dezyn, à chaque lecture de Figma, les mêmes données (ADR 0003 §4). Chacune de ces écritures deviendrait une proposition à relire, alors qu'elle ne change rien.

Décision prise lors de la séance de domain modeling du 2026-10-15.

Problématique : qu'est-ce qui délimite un lot de propositions, et que devient une écriture de l'IA qui ne change rien ou qui revient sur une proposition encore en attente ?

## Facteurs de décision

- Un lot de propositions correspond à ce que l'IA a voulu faire, pas à un aléa technique de connexion.
- Un import ne se retrouve ni coupé en plusieurs lots, ni noyé dans un lot de plusieurs semaines.
- L'éditeur relit les propositions d'un seul projet, avec les droits qu'il a sur ce projet.
- L'éditeur n'est pas bloqué pendant un long import.
- « Tout valider » ne valide que ce que l'éditeur a vu.
- Une équipe qui garde Figma (ADR 0003 §4) n'a pas à relire des écritures qui ne changent rien.
- L'éditeur ne relit pas des versions dont l'IA s'est elle-même détournée.
- Seul un éditeur fait passer une donnée de l'IA à Validée (ADR 0012 §1) : dezyn ne peut pas vérifier d'où vient ce qu'écrit l'IA (ADR 0003).

## Options envisagées

### Frontière du lot

#### Option A — La session MCP

- Inconvénient : imprévisible ; une reconnexion coupe un import en plusieurs lots.
- **Écartée.**

#### Option B — L'autorisation OAuth

- Inconvénient : dure des semaines et ferait un lot géant.
- **Écartée.**

#### Option C — La conversation

- Inconvénient : invisible pour dezyn.
- **Écartée.**

#### Option D — L'IA ouvre et ferme le lot en déclarant une intention, avec un lot automatique quand elle ne le fait pas

- Avantage : le lot correspond au but déclaré par l'IA, et l'intention dit à l'éditeur pourquoi le lot existe.
- Avantage : une écriture sans lot ouvert n'est pas perdue.
- **Retenue.**

### Fermeture d'un lot que l'IA ne ferme pas

#### Option M — Attendre que l'IA ferme le lot qu'elle a ouvert

- Inconvénient : une conversation abandonnée laisse un lot ouvert pour toujours, que l'éditeur ne peut jamais valider en entier.
- **Écartée.**

#### Option N — Tout lot se ferme après 30 minutes sans écriture de l'IA dans le projet

- Avantage : une seule règle pour les lots ouverts par l'IA et les lots automatiques.
- **Retenue.**

### Portée du lot

#### Option E — Un lot couvre plusieurs projets

- Inconvénient : les éditeurs et la validation sont par projet.
- **Écartée.**

#### Option F — Un lot appartient à un seul projet

- **Retenue.**

### Relecture d'un lot ouvert

#### Option G — Relecture interdite tant que le lot est ouvert

- Inconvénient : bloque l'éditeur pendant un long import.
- **Écartée.**

#### Option H — Relecture une par une sur un lot ouvert, validation du lot entier une fois le lot fermé

- Avantage : l'éditeur avance pendant l'import, et « tout valider » n'inclut pas des propositions arrivées après le clic.
- **Retenue.**

### Nouvelle proposition sur une donnée qui en a déjà une en attente

#### Option I — Garder les deux propositions en attente et laisser l'éditeur choisir

- Inconvénient : l'éditeur relit des versions dont l'IA s'est elle-même détournée.
- **Écartée.**

#### Option J — La nouvelle proposition remplace l'ancienne, qui passe au statut Remplacée

- Avantage : une seule proposition en attente par donnée.
- **Retenue.**

### Écritures répétées depuis une même source

#### Option K — Déclarer une source « de confiance », validée automatiquement

- Inconvénient : dezyn ne peut pas vérifier d'où vient ce qu'écrit l'IA (ADR 0003).
- **Écartée.**

#### Option L — Une écriture identique à la valeur validée ne crée aucune proposition

- Avantage : relire Figma n'ajoute rien à relire tant que rien n'a changé.
- **Retenue.**

## Décision

### 1. L'IA ouvre et ferme un lot de propositions avec une intention

L'IA ouvre un lot de propositions en déclarant son intention, par exemple « Import du Figma Healthcare ». Elle y écrit ses propositions, puis le ferme.

### 2. Sans lot ouvert, un lot s'ouvre automatiquement

Si l'IA écrit sans lot ouvert, ses propositions vont dans un lot ouvert automatiquement.

### 3. Un lot appartient à un seul projet

Une IA qui écrit dans deux projets produit deux lots de propositions.

### 4. Un lot ouvert se relit une proposition à la fois

Un éditeur peut valider ou rejeter les propositions d'un lot ouvert une par une. Valider le lot entier n'est possible qu'une fois le lot fermé.

### 5. Une écriture identique à la valeur validée ne crée aucune proposition

Une écriture de l'IA identique à la valeur validée de la donnée ne crée aucune proposition. Elle n'entre dans l'historique que comme appel MCP (ADR 0004 §1).

### 6. Une nouvelle proposition remplace la proposition en attente sur la même donnée

Une nouvelle proposition sur une donnée qui a déjà une proposition en attente la remplace, même si les deux appartiennent à des lots différents. L'ancienne passe au statut Remplacée dans son lot d'origine, n'est plus à relire, et reste dans l'historique.

### 7. Tout lot se ferme après 30 minutes sans écriture

Un lot de propositions, qu'il ait été ouvert par l'IA ou automatiquement, se ferme après 30 minutes sans nouvelle écriture de l'IA dans le projet.

### 8. Revenir à la valeur validée remplace la proposition en attente

Quand l'IA réécrit la valeur validée d'une donnée qui a une proposition en attente, cette proposition passe au statut Remplacée, et aucune nouvelle proposition n'est créée.

### 9. Seule une proposition au statut Proposée peut être validée

Un éditeur ne peut valider ou rejeter qu'une proposition au statut Proposée ; une proposition Remplacée ne se relit plus.

## Conséquences

### Positives

- Un lot de propositions correspond à une intention déclarée, que l'éditeur lit en ouvrant le lot.
- Une reconnexion MCP ne coupe pas un import en plusieurs lots.
- L'éditeur relit pendant un long import sans attendre sa fin.
- « Tout valider » ne valide que des propositions présentes au moment du clic.
- Une équipe qui garde Figma ne relit que ce qui a changé par rapport à la valeur validée.
- Une donnée a au plus une proposition en attente.

### Négatives

- Le MCP expose deux outils de plus, pour ouvrir et fermer un lot, et l'IA doit penser à les appeler.
- Une IA qui n'ouvre pas de lot produit des lots automatiques sans intention, découpés par le délai de 30 minutes plutôt que par son but.
- Une proposition a un statut de plus, Remplacée, à stocker et à afficher.
- Chaque écriture de l'IA est comparée à la valeur validée avant de devenir une proposition.

### Risques et mitigations

- **Un lot ouvert par l'IA n'est jamais fermé** (conversation abandonnée, IA qui oublie de fermer) : le lot entier ne pourrait pas être validé (§4). Mitigation : tout lot se ferme après 30 minutes sans écriture (§7).
- **L'éditeur valide une proposition que l'IA remplace au même moment** : l'éditeur relit une version déjà remplacée. Mitigation : seule une proposition au statut Proposée peut être validée (§9).

## Notes d'implémentation

Un lot de propositions porte son projet, son intention (vide pour un lot automatique), son état ouvert ou fermé, et la date de la dernière écriture de l'IA, qui sert au délai de fermeture du lot automatique. La comparaison à la valeur validée (§5, §8) et le remplacement d'une proposition en attente (§6) vivent dans le use-case d'écriture, partagé par le MCP et l'API (ADR 0007 §3).

## Liens

- [ADR 0012](0012-les-ecritures-de-l-ia-sont-des-propositions-relues-par-un-editeur.md) — remplace la session du §4 par un lot déclaré ; ajoute le statut Remplacée et l'écriture identique au §1.
- [ADR 0003](0003-import-export-orchestres-par-les-mcp-du-client.md) — une équipe qui garde Figma réécrit les mêmes données à chaque lecture (§4) ; dezyn ne vérifie pas la source de ce qu'écrit l'IA.
- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — une écriture identique n'entre dans l'historique que comme appel MCP (§1).
- [ADR 0007](0007-un-seul-backend-api-et-mcp-streamable-http-oauth.md) — la session Streamable HTTP et l'autorisation OAuth ne délimitent pas un lot.
