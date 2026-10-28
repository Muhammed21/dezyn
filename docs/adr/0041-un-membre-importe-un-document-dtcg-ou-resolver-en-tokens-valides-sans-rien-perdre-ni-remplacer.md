# 0041 — Un membre importe un document DTCG ou Resolver en tokens validés, sans rien perdre ni remplacer

- Statut : Accepté
- Date : 2026-10-28
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'ADR 0010 §2 promet qu'un ensemble de tokens importé en DTCG, puis réexporté, ressort identique. L'export existe : un document DTCG imbriqué par groupes pour un projet sans modes, un document Resolver pour un projet à modes (ADR 0039, ADR 0040). L'ADR 0039 a laissé l'import à une issue à part (#167), et la valeur de `version` acceptée à l'import reste un point ouvert.

L'IA du client importe déjà un projet existant avec ses propres accès, en aplatissant ce qu'elle lit vers `write_tokens` (ADR 0003 §2) ; ses écritures sont des propositions (ADR 0012 §1). Un membre n'a aucun moyen d'importer un fichier. Aucune route ne crée de modificateur ni de modes : un projet à modes ne naît aujourd'hui que par les seeds.

Un document écrit par un autre outil peut porter ce que dezyn ne stocke pas : un `$type`, une `$description` ou des `$extensions` posés sur un groupe, `$deprecated`, un token `$root`, des `sets`, plusieurs modificateurs, des sources par `$ref` externe.

Problématique : qui importe un document DTCG ou Resolver, sous quelle forme, et que fait l'import de ce que le projet contient déjà et de ce que dezyn ne sait pas stocker ?

## Facteurs de décision

- Ce qui est importé ressort identique de l'export (ADR 0010 §2) ; rien n'est perdu en silence.
- Ce qu'écrit un membre est validé directement (ADR 0012 §2).
- Un import ne laisse jamais le projet à moitié écrit.
- La première version sert le démarrage d'un projet à partir d'un fichier ; la resynchronisation viendra ensuite.

## Options envisagées

### Qui importe

#### Option A — Un membre, par une route HTTP

- Avantage : sert le bouton d'import de l'app web (ADR 0037) ; les tokens sont validés comme un ajout de membre.
- **Retenue.**

#### Option B — Le membre et l'IA ensemble

- Inconvénient : un outil `import_tokens` qui écrit des propositions double le chantier, alors que l'IA importe déjà par `write_tokens`.
- **Écartée** pour cette décision ; un outil viendra dans une issue à part si l'aplatissement par l'IA se révèle pénible.

#### Option C — L'IA seule

- Inconvénient : le membre reste sans import.
- **Écartée.**

### Les noms déjà présents

#### Option A — Refuser tout l'import

- Avantage : simple et sûr ; couvre le démarrage d'un projet et l'aller-retour vers un projet vide.
- Inconvénient : un fichier ne resynchronise pas un projet existant.
- **Retenue.**

#### Option B — Créer ou remplacer

- Avantage : resynchronise un projet depuis le code.
- Inconvénient : demande ses propres règles (changement de type, historique avant et après).
- **Écartée** pour cette décision.

#### Option C — Ignorer les existants

- Inconvénient : l'import réussit sans appliquer une partie du fichier.
- **Écartée.**

### Les modes

#### Option A — Créer les modes d'un projet vide, sinon exiger les mêmes

- Avantage : un projet à modes peut naître par l'API ; un projet existant ne change jamais de forme par un import.
- **Retenue.**

#### Option B — Ne jamais créer les modes

- Inconvénient : un projet à modes ne naît toujours que par les seeds.
- **Écartée.**

#### Option C — Créer ou compléter les modes

- Inconvénient : les tokens existants devraient recevoir une valeur dans chaque nouveau mode.
- **Écartée.**

### La version et la partie du Resolver acceptées

#### Option A — `2025.10` et la forme de l'export

- Avantage : ce que l'export écrit se réimporte ; tout le reste est refusé en nommant le champ.
- Inconvénient : un fichier qui utilise des `sets` ou plusieurs sources par contexte ne s'importe pas.
- **Retenue.**

#### Option B — Les brouillons, les `sets` et les sources multiples

- Inconvénient : des cas à tester qu'aucun fichier connu ne contient.
- **Écartée** ; ces formes s'ajouteront quand un vrai fichier en contiendra, comme les types de l'ADR 0028 §3.

### Ce que dezyn ne stocke pas

#### Option A — Hériter le `$type` d'un groupe, refuser le reste

- Avantage : les fichiers qui typent leurs groupes s'importent sans perte, l'export réécrivant le type sur chaque token.
- **Retenue.**

#### Option B — Tout refuser hors de la forme de l'export

- Inconvénient : beaucoup de fichiers réels typent leurs groupes et ne passeraient pas.
- **Écartée.**

#### Option C — Ignorer ce qui n'est pas stocké

- Inconvénient : l'import perd des données en silence.
- **Écartée.**

## Décision

### 1. Un membre importe par une route, en tokens validés

`POST /v1/projects/:id/tokens/import` prend un document en corps. Il demande le droit `token.create` ; un non-membre reçoit 404. Les tokens importés sont validés directement, et chacun laisse une entrée `token.created` avec le `correlationId` de la requête. Une proposition en attente du même nom est remplacée, comme à l'ajout d'un membre (ADR 0026). L'IA garde `write_tokens`.

### 2. Un import s'écrit en entier ou pas du tout

L'import est vérifié en entier avant d'écrire, puis écrit en une transaction. Un nom déjà validé dans le projet refuse tout l'import en 409. Un document invalide répond 400 avec toutes ses erreurs : `tokens.<nom>.<champ>` pour un token, le champ du document pour la structure. Les règles d'écriture s'appliquent à chaque token : types, valeurs, références vers un token du document ou un token validé du projet, modes complets, conflits de groupe (ADR 0039 §1). Un import contient 500 tokens au plus. Un import réussi répond 201 avec le nombre de tokens créés et les modes du projet.

### 3. Un document Resolver crée les modes d'un projet vide

Un document DTCG simple s'importe dans un projet sans modes. Un document Resolver s'importe dans un projet sans modes, sans token validé ni proposition en attente, en créant le modificateur sous son nom et les modes dans l'ordre des contextes ; une proposition en attente refuse l'import en 400, car elle ne pourrait plus être validée sans valeur par mode. La création laisse une entrée `modes.created`, sans état avant, avec le modificateur et ses modes après, le membre pour auteur et le `correlationId` de l'import ; dans un projet à modes, il exige le même modificateur et le même ensemble de modes, l'ordre du projet faisant foi. Les autres combinaisons sont refusées en 400. L'export échappe `~` et `/` dans le nom du modificateur qu'il écrit dans `$ref`.

### 4. L'import accepte la forme de l'export

Un document Resolver porte `version` à `2025.10`, un seul modificateur, une seule source en ligne par contexte et un `resolutionOrder` qui référence ce modificateur. Les `sets`, les `$ref` externes, plusieurs modificateurs ou plusieurs sources par contexte sont refusés en 400.

### 5. Le `$type` d'un groupe s'hérite, le reste non stocké est refusé

Un token sans `$type` prend celui de son groupe le plus proche. Une `$description` ou des `$extensions` de groupe, `$deprecated` et `$root` sont refusés en 400 avec leur chemin.

## Conséquences

### Positives

- Un membre démarre un projet à partir d'un fichier DTCG ou Resolver, et ce fichier ressort identique de l'export.
- Un projet à modes peut naître par l'API.
- Un import ne perd rien en silence et ne laisse jamais le projet à moitié écrit.

### Négatives

- Un fichier ne met pas à jour un projet existant : la resynchronisation demande une autre décision.
- Un fichier qui utilise des `sets`, plusieurs sources par contexte ou des descriptions de groupe ne s'importe pas tel quel.
- Un design system de plus de 500 tokens s'importe en plusieurs fichiers.

### Risques et mitigations

- **Un fichier réel utilise une forme refusée** : le 400 nomme le champ ; la forme s'ajoute quand un tel fichier se présente.
- **Un import de 500 tokens dépasse le temps CPU du Worker** : le passage au plan Workers Paid (#161) relève le plafond ; la limite de 500 se baisse sinon.
- **Des propositions attendent dans un projet sans modes** : le 400 demande de les relire avant d'importer un document Resolver.
- **Deux imports concurrents écrivent le même nom** : la contrainte d'unicité du nom en base fait échouer la seconde transaction, qui répond 409.

## Notes d'implémentation

1. Un document DTCG simple dans un projet sans modes : création validée, 409 des noms existants, références, limite, historique.
2. Le `$type` hérité d'un groupe, et le refus des propriétés non stockées.
3. Un document Resolver dans un projet qui a déjà les mêmes modes.
4. Un document Resolver qui crée le modificateur et les modes d'un projet vide, avec l'entrée `modes.created`, et l'échappement du `$ref` à l'export.

## Liens

- [ADR 0010](0010-tokens-au-format-dtcg-modes-par-le-resolver.md) — l'import et l'export DTCG sans perte (§2).
- [ADR 0039](0039-l-export-dtcg-imbrique-les-tokens-valides-et-decrit-les-modes-par-un-document-resolver.md) — la forme de l'export, les conflits de groupe ; l'import y était laissé à part.
- [ADR 0040](0040-le-document-resolver-exporte-porte-la-version-2025-10-de-la-specification-publiee.md) — la version `2025.10`, seule acceptée à l'import.
- [ADR 0012](0012-les-ecritures-de-l-ia-sont-des-propositions-relues-par-un-editeur.md) — ce qu'écrit un membre est validé ; l'IA écrit des propositions.
- [ADR 0003](0003-import-export-orchestres-par-les-mcp-du-client.md) — l'IA du client importe déjà par le MCP.
- [ADR 0026](0026-suppressions-ecritures-des-membres-variantes-et-decisions-dans-la-relecture-des-propositions.md) — l'écriture d'un membre remplace la proposition du même nom.
- [ADR 0028](0028-types-de-token-gradient-fontfamily-fontweight-et-number.md) — une forme non prise en charge attend un fichier qui la contient (§3).
