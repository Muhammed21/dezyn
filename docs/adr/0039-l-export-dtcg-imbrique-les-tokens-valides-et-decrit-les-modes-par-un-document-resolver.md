# 0039 — L'export DTCG imbrique les tokens validés par groupes et décrit les modes par un document Resolver ; un nom de token n'est jamais le groupe d'un autre

- Statut : Proposé
- Date : 2026-10-27
- Décideurs : Muhammed Cavus
- Amende : ADR 0010 (§2 : l'export arrive avant l'import ; la forme de l'export et la valeur de `version` en sortie)

## Contexte et problématique

L'ADR 0010 §2 promet un import et un export DTCG sans perte. dezyn n'a ni l'un ni l'autre : un membre ajoute un token par `POST /v1/projects/:id/tokens`, l'IA en propose par `write_tokens`, et la lecture (`GET /v1/projects/:id/tokens`, `read_tokens`) rend une liste à plat, avec des champs propres à dezyn (`id`, `status`, `duplicates`, `figma`). L'IA du client veut écrire les tokens du projet dans le code, et le futur front web les télécharger (issue #164).

Un projet a au plus un modificateur, avec des modes ordonnés. Le module Resolver de DTCG 2025.10 accepte des tokens écrits directement dans les contextes d'un modificateur, et exige `version` et `resolutionOrder`. Il se contredit sur la valeur de `version` : `2025-10-01` dans le tableau des champs, `2025-11-01` au §4.1.2 (ADR 0010, risques).

Un nom de token se découpe en groupes par des points. dezyn accepte aujourd'hui `couleur` et `couleur.fond` dans le même projet. En DTCG, `couleur` ne peut pas être à la fois un token et le groupe de `fond` ; le token `$root` d'un groupe porte le nom `couleur.$root`, pas `couleur`.

Problématique : sous quelle forme dezyn exporte-t-il les tokens d'un projet, par quel point d'entrée, et comment garantit-il qu'un export imbriqué ne perd rien ?

## Facteurs de décision

- Ce qu'un membre ou l'IA a écrit ressort identique de l'export (ADR 0010 §2).
- Les outils lisent d'abord le format DTCG simple ; le module Resolver est récent.
- La route et l'outil MCP appellent le même use-case (ADR 0007 §3).
- Un refus se découvre au moment d'écrire, pas longtemps après.

## Options envisagées

### Le périmètre

#### Option A — L'export seul

- Avantage : une PR de taille raisonnable ; « sans perte » se vérifie de l'écriture à l'export.
- Inconvénient : l'aller-retour complet attend l'import.
- **Retenue.** L'import fait l'objet d'une issue à part.

#### Option B — L'import et l'export ensemble

- Inconvénient : l'import demande la création en masse, les propositions, les modes et la `version` acceptée ; le chantier double.
- **Écartée.**

### Le point d'entrée

#### Option A — Une route HTTP

- Avantage : sert le bouton d'export du front web et un appel en CI.
- **Retenue**, avec l'option B.

#### Option B — Un outil MCP `export_tokens`

- Avantage : sert l'IA du client, qui écrit les tokens dans le code. L'appel entre dans l'historique (ADR 0021).
- **Retenue**, avec l'option A.

### La forme

#### Option A — Un document DTCG simple sans modes, un document Resolver avec modes

- Avantage : un projet sans modes se lit par tout outil DTCG.
- Inconvénient : deux formes de sortie selon le projet.
- **Retenue.**

#### Option B — Toujours un document Resolver

- Inconvénient : un outil qui ne lit que le format DTCG simple ne lit plus aucun export.
- **Écartée.**

#### Option C — Un ensemble de base et des différences par contexte

- Avantage : plus compact.
- Inconvénient : un token apparaît à deux endroits, l'aller-retour est plus dur à garantir.
- **Écartée.**

### Le nom qui est aussi un groupe

#### Option A — Refuser le conflit à l'écriture et à la validation

- Avantage : l'export imbrique toujours sans perte ; l'auteur apprend le conflit en écrivant.
- Inconvénient : une règle de plus sur les noms.
- **Retenue.**

#### Option B — Exporter avec `$root`

- Inconvénient : `couleur` ressort sous le nom `couleur.$root`, l'export n'est plus sans perte.
- **Écartée.**

#### Option C — Refuser seulement à l'export

- Inconvénient : le conflit se découvre longtemps après l'écriture.
- **Écartée**, sauf comme filet pour les projets qui ont déjà un conflit.

## Décision

### 1. Un nom de token n'est jamais le groupe d'un autre

Une écriture est refusée quand le nom du token est un préfixe de groupe d'un autre token du projet (`couleur` face à `couleur.fond`), ou quand un de ses groupes est le nom d'un autre token (`couleur.fond` face à `couleur`). La vérification porte sur les tokens validés, les propositions en attente et le reste du même lot. Elle vaut pour l'ajout d'un membre et pour `write_tokens`, et la validation d'une proposition la refait contre les tokens validés. Le refus nomme l'autre token. Un ajout de membre en conflit avec une proposition en attente d'un autre nom est refusé : il ne la remplace pas (ADR 0026 ne remplace qu'une proposition du même nom).

### 2. L'export rend les tokens validés, en champs DTCG

L'export ne contient que les tokens validés. Chaque token porte `$type`, `$value`, et `$description` et `$extensions` quand il en a. Les références restent écrites telles quelles, entières ou dans un champ (ADR 0029). Les champs propres à dezyn n'y figurent pas.

### 3. Sans modes, un document DTCG ; avec modes, un document Resolver

Un projet sans modes s'exporte en un document DTCG où les tokens sont imbriqués par groupes. Un projet avec modes s'exporte en un document Resolver : `version` vaut `2025-10-01` ; un modificateur porte le nom du modificateur du projet, avec un contexte par mode dans l'ordre des modes, chacun contenant tous les tokens du projet avec leur valeur dans ce mode, écrits directement ; `default` désigne le premier mode ; `resolutionOrder` référence ce modificateur.

### 4. Une route et un outil MCP

`GET /v1/projects/:id/tokens/export` et l'outil MCP `export_tokens` rendent le même document, par le même use-case. Tout membre de l'espace exporte ; un non-membre reçoit 404. L'outil entre dans l'historique comme tout outil qui vise un projet (ADR 0021).

### 5. Un conflit déjà présent répond 409

Un projet dont deux tokens validés sont déjà en conflit de nom ne s'exporte pas : la route répond 409 problem+json en nommant les tokens en conflit, et l'outil rend une erreur.

## Conséquences

### Positives

- Un projet s'exporte vers le code ou un outil DTCG, sans perte, par l'humain comme par l'IA.
- Un projet sans modes se lit par les outils qui ignorent le module Resolver.
- Le conflit de nom se découvre en écrivant.

### Négatives

- Deux formes d'export selon que le projet a des modes ou non.
- La description et les extensions se répètent dans chaque contexte d'un projet à modes.
- Une règle de nom de plus, que l'IA du client doit apprendre de ses refus.

### Risques et mitigations

- **Un outil attend `2025-11-01`** : la valeur vit dans une seule constante. La valeur acceptée à l'import reste un point ouvert (#167).
- **Des projets ont déjà un conflit de nom** : l'export répond 409 en nommant les tokens, que le membre renomme ou supprime.
- **Deux propositions en conflit validées dans le même lot** : la validation refait la vérification contre les tokens validés, token par token, dans l'ordre du lot.

## Notes d'implémentation

1. Le conflit de nom à l'écriture, puis à la validation d'une proposition.
2. La route d'export d'un projet sans modes, avec le 409 des conflits existants.
3. Le document Resolver des projets à modes.
4. L'outil MCP `export_tokens`.

## Liens

- [ADR 0010](0010-tokens-au-format-dtcg-modes-par-le-resolver.md) — l'import et l'export DTCG sans perte (§2) et les modes par le Resolver (§3) ; l'export arrive avant l'import.
- [ADR 0007](0007-un-seul-backend-api-et-mcp-streamable-http-oauth.md) — la route et l'outil appellent le même use-case.
- [ADR 0012](0012-les-ecritures-de-l-ia-sont-des-propositions-relues-par-un-editeur.md) — seuls les tokens validés font foi.
- [ADR 0021](0021-seuls-les-appels-mcp-qui-visent-un-espace-ou-un-projet-entrent-dans-l-historique.md) — `export_tokens` entre dans l'historique.
- [ADR 0026](0026-suppressions-ecritures-des-membres-variantes-et-decisions-dans-la-relecture-des-propositions.md) — l'ajout d'un membre ne remplace que la proposition du même nom.
- [ADR 0029](0029-un-champ-d-une-valeur-composee-peut-referencer-un-token.md) — les références de champ ressortent telles qu'écrites.
