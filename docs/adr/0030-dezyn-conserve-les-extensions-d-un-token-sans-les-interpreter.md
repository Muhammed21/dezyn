# 0030 — dezyn conserve les extensions d'un token sans les interpréter

- Statut : Accepté
- Date : 2026-10-20
- Décideurs : Muhammed

## Contexte et problématique

Le format DTCG réserve au champ `$extensions` d'un token les données propres à un outil, rangées sous une clé d'espace de noms, par exemple `com.figma`. dezyn refuse aujourd'hui un token qui porte `$extensions` : le schéma d'entrée est strict (ADR 0023 §1), et un test d'ajout de token vérifie ce refus.

À l'import d'un design system Figma, trois informations n'ont trouvé de place dans aucun type DTCG standard : l'italique d'une typographie (`s-italic`), sa mise en majuscules (`xs-caps`), et l'angle d'un dégradé (ADR 0028). L'IA les a reléguées en texte libre dans `$description`, d'où aucun outil ne les relit.

L'ADR 0010 a écarté l'« Option G — Toutes les valeurs dans le token, sous `$extensions` » : y ranger les valeurs de chaque mode, c'est-à-dire les données que dezyn lui-même interprète, que les autres outils ne voient pas. Ce qui se pose ici est autre chose : garder, à côté d'une valeur DTCG standard, des données qu'un autre outil a écrites et que dezyn n'interprète pas.

Problématique : dezyn accepte-t-il `$extensions`, et ces extensions comptent-elles pour l'écriture identique et pour le doublon ?

## Facteurs de décision

- L'import et l'export sans perte (ADR 0010 §2) : ce que Figma a écrit dans un fichier DTCG doit ressortir.
- Les valeurs que dezyn interprète restent dans les champs standard, lisibles par tous les outils (Option G de l'ADR 0010, écartée).
- Une donnée de design qui change passe par la relecture (ADR 0012 §1) ; rien ne change en silence.
- Le doublon signale deux tokens qui portent la même valeur de design (`CONTEXT.md`).

## Options envisagées

### dezyn accepte-t-il `$extensions`

#### Option A — Il les accepte et les rend telles quelles, sans les interpréter

- Avantage : l'import et l'export DTCG gardent ce qu'y a écrit un autre outil (ADR 0010 §2).
- Avantage : l'italique, les majuscules et l'angle d'un dégradé ont une place que l'IA relit à l'export vers Figma.
- Inconvénient : dezyn stocke et rend des données qu'il ne valide pas.
- **Retenue.**

#### Option B — Il les refuse, comme aujourd'hui

- Avantage : rien à stocker hors du format standard.
- Inconvénient : contredit l'ADR 0010 §2 ; l'IA relègue ces données en texte libre.
- **Écartée.**

#### Option C — Il interprète certaines clés connues comme des champs de dezyn

Par exemple `com.figma.italic` devient un champ de la typographie.

- Inconvénient : des valeurs que dezyn interprète vivent hors des champs standard, ce qu'a écarté l'ADR 0010 (Option G).
- **Écartée.**

### Les extensions comptent-elles pour l'écriture identique (ADR 0013 §5)

#### Option D — Oui

- Avantage : une écriture qui ne change que l'italique ou l'angle d'un dégradé crée une proposition, que l'éditeur relit.
- Inconvénient : une IA qui réécrit des extensions changeantes (un horodatage, un identifiant d'outil) crée des propositions sans changement de design.
- **Retenue.**

#### Option E — Non

- Inconvénient : une écriture qui ne change que les extensions ne crée aucune proposition ; le changement est perdu sans que personne le voie.
- **Écartée.**

### Les extensions comptent-elles pour le doublon

#### Option F — Non

- Avantage : deux tokens à la même valeur restent signalés, même quand un outil leur a donné des identifiants différents sous `$extensions`.
- Inconvénient : deux typographies identiques sauf l'italique, porté par `$extensions`, sont signalées comme doublons.
- **Retenue.**

#### Option H — Oui

- Inconvénient : dès qu'un outil range un identifiant propre à chaque token, plus aucun token n'a de doublon.
- **Écartée.**

## Décision

### 1. Un token peut porter `$extensions`

Un token peut porter un objet `$extensions`. Chaque clé nomme l'outil qui range la donnée, en notation de domaine inversé comme le recommande DTCG (par exemple `com.figma`) : au moins deux segments séparés par un point. dezyn refuse une autre clé, et des extensions de plus de 16 Ko une fois sérialisées. Le contenu rangé sous une clé est libre.

### 2. dezyn conserve les extensions sans les interpréter

dezyn stocke les extensions d'un token et les rend telles quelles à la lecture (`read_tokens`, GET) et à l'export. Aucune règle de dezyn ne les lit : ni la validation, ni les références, ni les modes, ni le doublon. Une valeur que dezyn interprète ne se range jamais sous `$extensions`.

### 3. Les extensions sont communes à tous les modes

Les extensions appartiennent au token, pas à la valeur d'un mode.

### 4. Les extensions comptent pour l'écriture identique

Une écriture identique à la valeur validée (ADR 0013 §5) l'est aussi par ses extensions. Une écriture qui ne change que les extensions crée une proposition.

### 5. Les extensions ne comptent pas pour le doublon

Deux tokens dont les valeurs sont identiques dans chaque mode sont des doublons, quelles que soient leurs extensions.

## Conséquences

### Positives

- Un fichier DTCG ressort avec les extensions qu'y a écrites Figma ou un autre outil (ADR 0010 §2).
- L'italique, les majuscules et l'angle d'un dégradé quittent `$description` pour une place que l'IA relit.
- Une modification des extensions passe par la relecture, comme toute donnée de design.

### Négatives

- dezyn garde des données qu'il ne valide pas ; l'interface ne peut les montrer qu'en JSON brut.
- Un token en italique et le même en romain sont signalés comme doublons quand l'italique est porté par `$extensions`.
- Une extension ne varie pas par mode : un angle de dégradé différent en clair et en sombre ne s'exprime pas.
- Les extensions occupent du stockage, compté dans les limites du plan (ADR 0006).
- Le schéma d'entrée strict (ADR 0023 §1) a un champ dont le contenu est libre.

### Risques et mitigations

- **Une IA range sous `$extensions` une valeur que dezyn devrait interpréter** : la règle du §2 se rappelle dans la description de l'outil `write_tokens` ; quand un même besoin revient, il devient un champ ou un type standard (comme l'ADR 0028).
- **Une IA réécrit des extensions changeantes et inonde la relecture** : la proposition montre que seules les extensions changent ; si le cas se présente, l'exclusion de certaines clés de la comparaison se décide alors.
- **Des extensions volumineuses** : le plafond de 16 Ko par token (§1) les refuse ; il se relève si un outil réel le dépasse.

## Notes d'implémentation

1. `$extensions` s'ajoute à chaque type de `token-definition.ts` comme un objet dont les clés suivent la notation de domaine inversé, plafonné à 16 Ko sérialisés ; le test qui vérifie son refus s'inverse.
2. Les extensions se stockent avec le token (une colonne jsonb de `token`), pas avec `token_value`.
3. `sameDefinition` compare aussi les extensions ; `duplicatesOf` ne les passe pas.

## Liens

- [ADR 0006](0006-plans-free-et-team-mcp-complet-dans-tous-les-plans.md) — le stockage compté par le plan.
- [ADR 0010](0010-tokens-au-format-dtcg-modes-par-le-resolver.md) — l'import sans perte (§2) ; l'Option G écartée, distincte de ce qui est décidé ici.
- [ADR 0012](0012-les-ecritures-de-l-ia-sont-des-propositions-relues-par-un-editeur.md) — une modification de donnée de design est une proposition.
- [ADR 0013](0013-lots-de-propositions-declares-par-l-ia-propositions-remplacees-et-ecritures-identiques.md) — l'écriture identique (§5) compte les extensions.
- [ADR 0023](0023-reponses-ouvertes-enums-ouverts-et-unions-extensibles-dans-les-contrats.md) — les entrées strictes (§1), dont `$extensions` est le contenu libre.
- [ADR 0028](0028-types-de-token-gradient-fontfamily-fontweight-et-number.md) — l'angle d'un dégradé n'est pas dans sa valeur DTCG.
