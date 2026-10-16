# 0012 — Les écritures de l'IA sont des propositions, relues par lot et validées ou rejetées par un éditeur

- Statut : Accepté — §4 remplacé et §1 complété par [0013](0013-lots-de-propositions-declares-par-l-ia-propositions-remplacees-et-ecritures-identiques.md) ; §1 (suppressions, donnée relue d'un composant), §2 (token fixé par une décision) et §5 (une décision et ses tokens) remplacés par [0026](0026-suppressions-ecritures-des-membres-variantes-et-decisions-dans-la-relecture-des-propositions.md)
- Date : 2026-10-15
- Décideurs : Muhammed

## Contexte et problématique

Toute donnée de la plateforme est consultable et validable par un humain (ADR 0001 §4), et l'IA du client écrit dans la plateforme via le MCP (ADR 0002 §2). Sans statut, une hallucination devient vérité dès qu'elle est écrite, et elle est servie à l'IA suivante.

L'import depuis Figma ou un repo (ADR 0003) écrit beaucoup de données d'un coup, par exemple 40 couleurs, 12 typographies et 8 composants.

Les validations humaines entrent dans l'historique (ADR 0004 §4). Les éditeurs d'un espace valident ou rejettent les propositions (ADR 0011 §3).

Décision prise lors de la séance de domain modeling du 2026-10-15.

Problématique : quand une écriture de l'IA fait-elle foi pour le projet, et comment un éditeur la relit-il ?

## Facteurs de décision

- Une hallucination de l'IA ne fait pas foi et n'est pas servie comme vérité à l'IA suivante.
- Une seule écriture de l'IA ne casse pas un projet.
- L'IA continue de faire évoluer le design, y compris les données déjà validées.
- La relecture d'un import reste praticable.
- La mémoire de la direction artistique ne contredit pas le design.
- L'IA n'est pas bloquée juste après un import.

## Options envisagées

### Option A — Toute écriture de l'IA est une proposition, validée ou rejetée par un éditeur

- Avantage : seules les données relues par un éditeur font foi.
- Inconvénient : l'éditeur doit relire pour que le travail de l'IA fasse foi.
- **Retenue.**

### Option B — Une modification proposée remplace la donnée validée, qui repasse au statut Proposée

- Inconvénient : une seule écriture de l'IA casserait le projet.
- **Écartée.**

### Option C — L'IA ne modifie pas une donnée validée

- Inconvénient : l'IA ne pourrait plus faire évoluer le design.
- **Écartée.**

### Option D — Une modification proposée coexiste avec la donnée validée

- Avantage : la valeur validée continue de faire foi tant que la proposition attend.
- Inconvénient : deux états, validé et proposé, à stocker et à afficher pour une même donnée.
- **Retenue.**

### Option E — Relecture uniquement proposition par proposition

- Inconvénient : rendrait impraticable la relecture d'un import (ADR 0003), par exemple 40 couleurs, 12 typographies et 8 composants.
- **Écartée.**

### Option F — Relecture par lot de propositions

- Avantage : un import se relit en une fois, en rejetant au besoin certaines propositions.
- **Retenue.**

### Option G — Le MCP ne sert jamais les propositions

- Inconvénient : l'IA est bloquée juste après un import, tant qu'un éditeur n'a pas relu.
- **Écartée.**

### Option H — Le MCP sert toutes les données, quel que soit leur statut

- Inconvénient : les hallucinations redeviennent vérité pour l'IA suivante.
- **Écartée.**

### Option I — Le MCP sert les données validées, et les propositions sur demande explicite

- Avantage : l'IA lit par défaut ce qui fait foi, et peut reprendre son travail non relu.
- Inconvénient : complexité côté MCP pour le filtre par statut.
- **Retenue.**

## Décision

### 1. Toute écriture de l'IA est une proposition

Une création ou une modification d'un token, d'un composant ou d'une décision écrite par l'IA est une proposition, au statut Proposée. Un éditeur la passe à Validée ou Rejetée. Seules les données validées font foi pour le projet.

### 2. Ce qu'écrit un membre dans l'interface est validé

Une donnée écrite par un membre dans l'interface est Validée directement.

### 3. Une modification proposée ne remplace pas la donnée validée

La valeur validée continue de faire foi jusqu'à ce qu'un éditeur valide la proposition qui la modifie.

### 4. Les propositions d'une même session forment un lot

Les propositions écrites par l'IA au cours d'une même session forment un lot de propositions, relu ensemble. L'éditeur peut valider le lot en rejetant certaines propositions une par une.

### 5. Une décision et ses tokens sont validés ou rejetés ensemble

Une décision et les tokens qu'elle fixe passent ensemble à Validée ou à Rejetée.

### 6. Le MCP sert par défaut les données validées

Via le MCP, l'IA lit par défaut uniquement les données validées. Elle lit les propositions seulement si elle les demande explicitement, et les reçoit avec leur statut.

### 7. Chaque validation ou rejet entre dans l'historique

Chaque validation et chaque rejet laisse une entrée dans l'historique (ADR 0004 §4), avec l'éditeur qui l'a fait.

## Conséquences

### Positives

- Une hallucination de l'IA ne fait pas foi tant qu'un éditeur ne l'a pas validée, et n'est pas servie par défaut à l'IA suivante.
- Une écriture de l'IA ne casse pas un projet : la valeur validée reste en place.
- Un import se relit en un lot.
- La mémoire de la direction artistique et les tokens qu'elle fixe restent cohérents.
- L'historique dit quel éditeur a validé ou rejeté chaque proposition.

### Négatives

- L'éditeur doit relire pour que le travail de l'IA fasse foi.
- Deux états, validé et proposé, à stocker et à afficher pour une même donnée.
- Le filtre par statut ajoute de la complexité côté MCP.

### Risques et mitigations

- **Une hallucination fait foi** : seul un éditeur passe une proposition à Validée (§1), et le MCP ne sert pas les propositions par défaut (§6).
- **L'IA est bloquée après un import non relu** : elle lit les propositions sur demande explicite, avec leur statut (§6).
- **Relecture impraticable d'un gros import** : relecture par lot (§4).
- **La mémoire de la direction artistique contredit le design** : une décision et ses tokens sont validés ou rejetés ensemble (§5).

## Notes d'implémentation

Une donnée de design porte sa valeur validée et, à côté, les propositions qui la modifient. Un outil MCP de lecture prend un paramètre explicite pour inclure les propositions, et renvoie le statut de chaque donnée. Les outils MCP et les routes d'API partagent les mêmes use-cases (ADR 0007 §3).

## Liens

- [ADR 0001](0001-plateforme-centrale-de-design-plutot-que-pont-figma-code.md) — toute donnée est consultable et validable par un humain (§4).
- [ADR 0002](0002-ia-du-client-via-mcp-sans-ia-embarquee.md) — l'IA du client écrit via le MCP.
- [ADR 0003](0003-import-export-orchestres-par-les-mcp-du-client.md) — un import arrive comme un lot de propositions.
- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — chaque validation ou rejet entre dans l'historique.
- [ADR 0007](0007-un-seul-backend-api-et-mcp-streamable-http-oauth.md) — outils MCP et routes d'API partagent les mêmes use-cases.
- [ADR 0011](0011-l-espace-possede-les-projets-et-porte-le-plan.md) — le rôle d'éditeur qui relit les propositions.
