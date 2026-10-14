# 0001 — Plateforme centrale de design pensée pour l'IA plutôt que pont Figma → code

- Statut : Proposé
- Date : 2026-10-14
- Décideurs : Muhammed

## Contexte et problématique

L'outil actuel récupère fidèlement un design Figma (design system, tokens, composants) pour le passer en code « pixel perfect ». Il comprend un dashboard « Storybook++ », un serveur MCP et un historique des appels d'outils de l'IA (synthèse §2, L11–17).

Trois constats issus de la discussion du 13/10/2026 :

- Un outil placé entre Figma et le code est coincé entre deux géants : il finit racheté ou, plus souvent, copié (L19–21).
- Aucun endroit ne garde la mémoire de la direction artistique : couleurs, typos, choix. On demande à l'IA « fais dans le style de la DA Healthcare » sans savoir sur quels assets elle s'appuie (L5–7).
- Un Figma est cher en tokens, peu ordonné et pas pensé pour l'IA (L41–43).

Problématique : le produit reste-t-il un pont entre Figma et le code, ou devient-il la source de vérité du design que l'IA lit et écrit ?

## Facteurs de décision

- Résister à la copie ou à l'absorption par Figma ou par les outils de code (L19–21).
- Garder une mémoire durable de la direction artistique et des décisions design (L7, L23).
- Réduire les tokens, le flou et la friction quand l'IA travaille sur le design (L41).
- Permettre à un humain de voir et valider ce que l'IA produit (L9, L31, L41).

## Options envisagées

### Option A — Pont Figma → code

Le produit actuel : il lit Figma et produit du code fidèle.

- Avantage : déjà construit, problème réel vécu en freelance (L11–13).
- Inconvénient : dépend des deux extrémités, qui peuvent reproduire la fonction (L19–21).
- **Écartée** : un outil coincé entre deux géants est avalé par l'un des deux.

### Option B — Plateforme centrale de design pour l'IA

La plateforme stocke la direction artistique, le design system, les composants et l'historique des décisions design. L'IA y lit et y écrit via MCP ; l'humain la consulte et valide (L23, L27, L41).

- Avantage : remplace l'un des deux maillons et ajoute la mémoire design, ce qui oblige à la prendre en entier (L21).
- Avantage : donnée structurée pour l'IA, moins coûteuse à lire qu'un Figma ou un repo (L41).
- Inconvénient : demande aux designers « full Figma » de changer d'outil de référence (L23–27).
- **Retenue.**

## Décision

### 1. La plateforme est la source de vérité du design

Elle stocke les couleurs, les typos, les dimensions, les effets, les animations, les composants, la direction artistique et l'historique des décisions design d'un projet. Figma, le code final et les POC sont des sorties ou des sources d'import, pas la référence (L23, L27–29).

### 2. Les composants sont stockés en web réel

Un composant est du web interactif, consultable comme dans un Storybook ; ce stockage est aussi son affichage (L23).

### 3. Chaque décision design est une entrée historisée

Une décision prise en discutant avec l'IA (« couleur principale : rouge », « titres : Poppins », « corps : Manrope ») est enregistrée comme une entrée de la base, avec son historique (L35–41).

### 4. Toute donnée est consultable et validable par un humain

La plateforme expose visuellement ce que l'IA a écrit pour repérer hallucinations et ajouts indésirables (L9, L41).

## Conséquences

### Positives

- La direction artistique et ses décisions ont une mémoire unique, interrogeable par l'IA.
- L'IA consulte une donnée structurée au lieu d'analyser un Figma ou un repo entier (L41).
- Le produit couvre direction artistique et design system en même temps (L23).

### Négatives

- Les designers « full Figma » font un double travail tant que l'existant n'est pas importé (L23–27).
- Les équipes qui ont déjà un design system Figma solide gardent Figma comme outil de travail ; la plateforme en reste une copie tenue à jour par l'IA (ADR 0003 §4).
- Le stockage en web réel impose de maintenir un rendu de composants interactifs dans la plateforme.

### Risques et mitigations

- **Le repo concurrence la plateforme** : l'IA lit déjà très bien le code (L43). Mitigation : la plateforme devient la référence contre laquelle le code est vérifié par régression visuelle (ADR 0005).
- **Double travail du designer** : mitigé par l'import via l'IA depuis Figma ou le repo (ADR 0003) et par le démarrage direct d'un nouveau projet dans l'outil (L23–27).
- **Équipes avec un design system Figma solide** (L25) : elles n'ont rien à migrer. Dès que le MCP de la plateforme est connecté, chaque lecture de Figma par l'IA alimente la plateforme (ADR 0003 §4).

## Notes d'implémentation

Le dashboard, le serveur MCP et l'historique des appels existants sont repris comme socle (synthèse §2). Le modèle de données part de l'existant : couleurs, typos, dimensions, effets, animations, composants, décisions.

## Liens

- [ADR 0002](0002-ia-du-client-via-mcp-sans-ia-embarquee.md) — l'IA qui lit et écrit dans la plateforme est celle du client.
- [ADR 0003](0003-import-export-orchestres-par-les-mcp-du-client.md) — comment la base se remplit depuis Figma ou le repo.
- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — trace de ce que l'IA et les humains font.
- [ADR 0005](0005-regression-visuelle-des-snapshots-envoyes-par-la-ci.md) — le rendu des composants sert de référence pour vérifier le code.
- [Synthèse de la discussion du 13/10/2026](../synthese.md)
