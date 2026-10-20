# 0028 — Types de token `gradient`, `fontFamily`, `fontWeight` et `number`

- Statut : Accepté
- Date : 2026-10-20
- Décideurs : Muhammed

## Contexte et problématique

Un token porte un `$type` DTCG (ADR 0010 §1). dezyn accepte aujourd'hui quatre types : `color`, `dimension`, `typography` et `shadow` (`apps/api/src/modules/token/contracts/token-definition.ts`).

L'IA d'un client a importé par le MCP (`write_tokens`) un design system Figma : 169 tokens acceptés (68 couleurs, 55 dimensions, 36 typographies, 10 ombres). Faute de type, une partie du fichier a été déformée ou perdue :

- **Dégradés (7)** : sans type `gradient`, chaque dégradé a été éclaté en deux couleurs `color.gradient.<nom>.start` et `.end` ; l'angle et la position des arrêts sont relégués en texte dans `$description`.
- **Familles et graisses de police** : sans type `fontFamily` ni `fontWeight`, il n'existe aucun token vers lequel une typographie pourrait pointer.
- **Opacités (0,08 à 0,4)** : non importées, faute de type `number`.

L'ADR 0010 promet un import et un export sans perte (§2), et cite parmi les types DTCG qui couvrent le périmètre de l'ADR 0001 : `color`, `dimension`, `fontFamily`, `fontWeight`, `typography`, `shadow`, `duration`, `cubicBezier`, `transition`, `border`, `gradient` (Option A). Le type `number` n'est pas dans cette liste.

Problématique : quels types de token dezyn ajoute-t-il maintenant, et lesquels attendent ?

## Facteurs de décision

- L'import et l'export sans perte (ADR 0010 §2) : un dégradé éclaté en deux couleurs ne ressort pas en dégradé.
- Un import réel, pas une liste théorique, décide de ce qui est construit maintenant.
- Les types standard du format DTCG plutôt qu'un type maison (ADR 0010, Option A).
- Chaque type ajouté demande sa validation, son stockage, sa lecture et ses messages d'erreur.

## Options envisagées

### Option A — Ajouter les types que l'import réel a perdus : `gradient`, `fontFamily`, `fontWeight`, `number`

- Avantage : couvre toutes les pertes de type constatées à l'import.
- Avantage : `fontFamily`, `fontWeight` et `number` donnent aux typographies des tokens vers lesquels pointer (ADR 0029).
- Inconvénient : `number` n'est pas dans la liste de l'ADR 0010 et sort de ce qu'elle annonçait.
- **Retenue.**

### Option B — Ajouter d'un coup le reste de la liste de l'ADR 0010, et `strokeStyle`

`duration`, `cubicBezier`, `transition` et `border` en plus, que cite l'ADR 0010, et `strokeStyle`, qu'il ne cite pas.

- Avantage : la liste de l'ADR 0010 est couverte en une fois.
- Inconvénient : cinq types de plus à valider, stocker et tester, qu'aucun import n'a encore demandés.
- **Écartée** : aucun import ne les a encore apportés.

### Option C — Garder les quatre types, et porter le reste en texte dans `$description`

- Avantage : rien à construire.
- Inconvénient : contredit l'ADR 0010 §2 ; un dégradé ne ressort jamais en dégradé, une opacité n'entre pas.
- **Écartée.**

## Décision

### 1. dezyn accepte quatre types de plus

Un token peut être de type `gradient`, `fontFamily`, `fontWeight` ou `number`, avec la valeur que leur donne le format DTCG 2025.10 :

- `fontFamily` : un nom de police, ou une liste de noms par ordre de préférence ;
- `fontWeight` : un nombre de 1 à 1000, ou un des mots-clés DTCG (ceux qu'accepte déjà le champ `fontWeight` d'une typographie) ;
- `number` : un nombre sans unité, par exemple une opacité ou un interligne ;
- `gradient` : une liste d'arrêts, chacun avec une couleur et une position de 0 à 1.

Ces types suivent toutes les règles des autres : modes (ADR 0010 §3 et §4), alias de la valeur entière vers un token validé du même type, propositions (ADR 0012), écritures identiques (ADR 0013 §5).

### 2. Un champ d'une valeur composée a le même format que le type correspondant

Le champ `fontFamily` d'une typographie a la valeur d'un token `fontFamily`, son `fontWeight` celle d'un token `fontWeight`, son `lineHeight` celle d'un token `number` ; la couleur d'un arrêt de dégradé a celle d'un token `color`. Une même valeur s'écrit de la même façon, qu'elle soit un token ou un champ.

### 3. Les autres types DTCG attendent un import qui en contient

`duration`, `cubicBezier`, `transition`, `border` et `strokeStyle` arrivent avec le premier import qui en contient, chacun par un nouvel ADR. D'ici là, une écriture qui en porte un est refusée avec un message qui nomme le type.

## Conséquences

### Positives

- Un dégradé s'importe et s'exporte en dégradé (ADR 0010 §2).
- Les opacités du design system entrent dans dezyn.
- Une typographie a des tokens de police, de graisse et d'interligne vers lesquels pointer (ADR 0029).

### Négatives

- Quatre types de plus à valider, à stocker, à rendre à la lecture et à décrire dans les messages d'erreur.
- L'angle et la forme d'un dégradé (linéaire, radial) ne sont pas dans la valeur DTCG d'un `gradient` : ils restent hors de la valeur, sous `$extensions` (ADR 0030).
- Les clients de l'API et du MCP voient apparaître des `$type` nouveaux ; ceux qui ne les connaissent pas les reçoivent par la variante de repli des unions de sortie (ADR 0023 §3).
- Un `number` sans unité ne dit pas ce qu'il représente : une opacité et un interligne ont le même type.

### Risques et mitigations

- **Un import contient un type qui attend encore (§3)** : l'écriture est refusée avec un message qui nomme le type ; l'IA sait ce qu'elle n'a pas pu importer et le dit au membre.
- **Les dégradés déjà éclatés en deux couleurs restent dans le projet importé** : un nouvel import du même fichier propose les tokens `gradient` ; un éditeur supprime ensuite les couleurs `color.gradient.*`, qui ne se suppriment pas tant qu'un alias les référence (ADR 0026 §2).

## Notes d'implémentation

Chaque type s'ajoute à l'union discriminée de `token-definition.ts` (entrée stricte, ADR 0023 §1), au type `TokenDefinition` du domaine, et à l'union de sortie extensible (ADR 0023 §3). La validation des valeurs vit dans le domaine, comme `color.ts` et `typography.ts` ; les mots-clés de graisse sont ceux de `FONT_WEIGHT_KEYWORDS`. Le stockage de la valeur reste `token_value.value` (jsonb).

## Liens

- [ADR 0010](0010-tokens-au-format-dtcg-modes-par-le-resolver.md) — les types DTCG du périmètre, l'import et l'export sans perte.
- [ADR 0023](0023-reponses-ouvertes-enums-ouverts-et-unions-extensibles-dans-les-contrats.md) — les nouveaux `$type` en sortie passent par une union extensible.
- [ADR 0026](0026-suppressions-ecritures-des-membres-variantes-et-decisions-dans-la-relecture-des-propositions.md) — un token encore référencé ne se supprime pas.
- [ADR 0029](0029-un-champ-d-une-valeur-composee-peut-referencer-un-token.md) — les champs d'une valeur composée pointent vers ces types.
- [ADR 0030](0030-dezyn-conserve-les-extensions-d-un-token-sans-les-interpreter.md) — l'angle d'un dégradé vit sous `$extensions`.
