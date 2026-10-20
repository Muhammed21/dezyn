# 0029 — Un champ d'une valeur composée peut référencer un token

- Statut : Accepté
- Date : 2026-10-20
- Décideurs : Muhammed

## Contexte et problématique

Une référence à un autre token s'écrit en alias DTCG `{groupe.token}` (ADR 0010 §1). dezyn n'accepte un alias qu'à la place de la valeur entière, dans `$value` ou dans la valeur d'un mode (`aliasOr` dans `apps/api/src/modules/token/contracts/token-definition.ts`). La référence est résolue à l'écriture : un nom inconnu, un token non validé ou un token d'un autre type est refusé (`resolveReference` dans `domain/reference.ts`). En base, une valeur de token porte soit une valeur, soit l'identifiant du token référencé (`token_value.value` ou `token_value.referenced_token_id`, l'un exclusif de l'autre).

À l'import d'un design system Figma, les 36 typographies ont reçu leur police, leur graisse, leur taille et leur interligne recopiés en dur, au lieu de pointer vers `font.family.*`, `font.weight.*` et `font.size.*`. La couleur d'une ombre a subi la même perte. Le format DTCG permet pourtant qu'un champ d'une valeur composée soit lui-même un alias.

Le doublon (`CONTEXT.md`) exclut aujourd'hui « un token qui référence un autre token » ; seul l'alias de la valeur entière est vu comme une référence (`domain/duplicates.ts`).

Problématique : un champ d'une valeur composée peut-il référencer un token, et qu'est-ce que cela change aux règles des références, aux doublons et au stockage ?

## Facteurs de décision

- L'import et l'export sans perte (ADR 0010 §2) : une typographie qui pointe vers `{font.size.md}` doit ressortir avec ce pointeur.
- Les alias rendent les décisions explicites pour l'IA (ADR 0010, Option A) : changer `font.size.md` doit changer toutes les typographies qui l'utilisent.
- Une seule règle de résolution pour toutes les références.
- La suppression d'un token encore référencé est refusée (ADR 0026 §2) : la base doit savoir qui référence quoi.

## Options envisagées

### Où un alias est accepté

#### Option A — Dans tout champ d'une valeur composée, vers un token du type du champ

- Avantage : suit le format DTCG ; l'import Figma garde ses liens.
- Inconvénient : la résolution, le stockage et la détection des doublons descendent dans les champs.
- **Retenue.**

#### Option B — Seulement à la place de la valeur entière, comme aujourd'hui

- Avantage : rien à construire.
- Inconvénient : les typographies et les ombres recopient leurs valeurs ; un changement de `font.size.md` ne les atteint pas.
- **Écartée.**

### Un token dont un champ est une référence est-il un doublon possible

#### Option C — Non : une référence, où qu'elle soit, écarte le token

- Avantage : une seule règle, qui prolonge celle d'aujourd'hui (une référence dans un seul mode suffit à écarter le token).
- Inconvénient : deux typographies composées des mêmes tokens ne sont pas signalées.
- **Retenue.**

#### Option D — Oui : on compare les valeurs telles qu'écrites, alias compris

- Avantage : deux typographies aux mêmes champs et aux mêmes alias sont signalées.
- Inconvénient : deux règles, l'une pour l'alias de la valeur entière, l'autre pour l'alias d'un champ.
- **Écartée.**

### Comment la base garde une référence de champ

#### Option E — Une référence par champ, qui pointe vers le token référencé par une clé étrangère

- Avantage : la base sait qui référence quoi ; la suppression d'un token référencé se refuse sans parcourir les valeurs jsonb (ADR 0026 §2).
- Avantage : un renommage du token référencé ne casse pas la référence.
- Inconvénient : une valeur composée se relit en recomposant ses champs et ses références.
- **Retenue.**

#### Option F — L'alias reste une chaîne `{…}` dans la valeur jsonb

- Avantage : rien à changer au schéma.
- Inconvénient : aucune clé étrangère ; trouver les références d'un token demande de parcourir toutes les valeurs, et un renommage casse les alias.
- **Écartée.**

## Décision

### 1. Un champ d'une valeur composée peut être un alias

Un champ d'une valeur composée peut être un alias DTCG `{groupe.token}` à la place de sa valeur :

| Valeur composée    | Champ           | Type du token référencé |
| ------------------ | --------------- | ----------------------- |
| `typography`       | `fontFamily`    | `fontFamily`            |
| `typography`       | `fontSize`      | `dimension`             |
| `typography`       | `fontWeight`    | `fontWeight`            |
| `typography`       | `lineHeight`    | `number`                |
| `typography`       | `letterSpacing` | `dimension`             |
| `shadow` (couche)  | `color`         | `color`                 |
| `shadow` (couche)  | `offsetX`       | `dimension`             |
| `shadow` (couche)  | `offsetY`       | `dimension`             |
| `shadow` (couche)  | `blur`          | `dimension`             |
| `shadow` (couche)  | `spread`        | `dimension`             |
| `gradient` (arrêt) | `color`         | `color`                 |
| `gradient` (arrêt) | `position`      | `number`                |

Les types `fontFamily`, `fontWeight`, `number` et `gradient` sont ceux de l'ADR 0028.

### 2. Une référence de champ suit les règles de toute référence

Une référence de champ se résout comme une référence de valeur entière. Elle est refusée quand le token est inconnu, quand il n'est pas validé, ou quand son type n'est pas celui du champ. Le refus nomme le chemin du champ (par exemple `modes.sombre.fontSize`).

### 3. Un token qui contient une référence n'est pas un doublon

Un token qui contient une référence, dans sa valeur entière ou dans un de ses champs, dans un mode au moins, n'est pas un doublon et n'en signale aucun.

### 4. La base garde chaque référence de champ vers le token référencé

Chaque référence, de valeur entière ou de champ, est gardée en base avec le chemin du champ dans la valeur et une clé étrangère vers le token référencé. La lecture (`read_tokens`, GET) rend l'alias `{groupe.token}` au nom actuel du token référencé, à sa place dans la valeur.

## Conséquences

### Positives

- Les typographies et les ombres importées gardent leurs liens vers les tokens de police, de taille, de graisse et de couleur (ADR 0010 §2).
- Changer `font.size.md` change toutes les typographies qui l'utilisent.
- La suppression d'un token référencé par un champ est refusée comme celle d'un token référencé par un alias entier (ADR 0026 §2).

### Négatives

- Deux typographies composées exactement des mêmes tokens ne sont pas signalées comme doublons ; après un import qui crée des alias partout, la détection des doublons ne voit presque plus les typographies ni les ombres.
- Le modèle relationnel change : une valeur n'est plus soit une valeur, soit une référence ; elle peut être une valeur qui contient des références. La contrainte d'exclusion de `token_value` et la lecture des valeurs sont à reprendre.
- Une écriture identique (ADR 0013 §5) compare les valeurs telles qu'écrites : une typographie validée avec `16px` en dur, réécrite avec `{font.size.md}` qui vaut `16px`, crée une proposition.

### Risques et mitigations

- **Une valeur composée relue en base ne correspond plus à celle écrite** (un champ perdu à la recomposition) : un test d'aller-retour écriture → lecture couvre chaque champ du tableau du §1, alias et valeur en dur.
- **L'IA écrit un alias vers un token qu'elle crée dans le même appel** : la résolution accepte déjà un token écrit dans le même appel (`written` dans `resolveReference`) ; la règle vaut pour les champs.

## Notes d'implémentation

1. Dans `token-definition.ts`, chaque champ du tableau du §1 passe par `aliasOr`, comme la valeur entière.
2. `referencedNames` et la résolution de `add-token.ts` parcourent les champs et rendent le chemin de chaque référence.
3. `referencesAnother` dans `domain/duplicates.ts` cherche une référence dans toute la valeur.
4. La forme exacte du stockage (une table de références par valeur et chemin, ou une autre) se décide avec la migration ; elle garde une clé étrangère vers le token référencé. La référence de valeur entière peut devenir une référence au chemin vide.

## Liens

- [ADR 0009](0009-drizzle-pour-postgresql-migrations-hors-demarrage.md) — le schéma et la migration du stockage des références.
- [ADR 0010](0010-tokens-au-format-dtcg-modes-par-le-resolver.md) — l'alias DTCG (§1) et l'import sans perte (§2).
- [ADR 0013](0013-lots-de-propositions-declares-par-l-ia-propositions-remplacees-et-ecritures-identiques.md) — l'écriture identique compare les valeurs telles qu'écrites.
- [ADR 0024](0024-l-etat-figma-d-un-token-est-declare-par-l-ia-du-client.md) — le doublon se détecte dans dezyn (§5).
- [ADR 0026](0026-suppressions-ecritures-des-membres-variantes-et-decisions-dans-la-relecture-des-propositions.md) — un token encore référencé ne se supprime pas (§2).
- [ADR 0028](0028-types-de-token-gradient-fontfamily-fontweight-et-number.md) — les types vers lesquels pointent les champs.
