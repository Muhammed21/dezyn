# 0004 — Historique unique des actions de l'IA et des humains pour le suivi, l'auto-correction et l'audit

- Statut : Accepté — §5 (auteur d'une entrée d'un compte supprimé) remplacé par [0015](0015-l-historique-garde-les-actions-d-un-compte-supprime-sous-un-membre-supprime.md) ; §1 (appels journalisés) remplacé par [0021](0021-seuls-les-appels-mcp-qui-visent-un-espace-ou-un-projet-entrent-dans-l-historique.md)
- Date : 2026-10-14
- Décideurs : Muhammed

## Contexte et problématique

L'IA du client écrit dans la base de connaissances design (ADR 0002). Elle peut halluciner ou ajouter des éléments non demandés (L9, L41). L'outil actuel journalise déjà chaque appel d'outil MCP et permet de suivre en temps réel ce que fait l'IA (L15).

Les humains agissent aussi sur la base : ils valident ce que l'IA a écrit (ADR 0001 §4), modifient le design et tranchent les écarts de régression visuelle (ADR 0005 §5).

Problématique : comment savoir qui, de l'IA ou d'un humain, a fait quoi et quand dans la plateforme ?

## Facteurs de décision

- Voir en temps réel ce que fait l'IA (L15).
- Permettre à l'IA de se corriger seule (L17).
- Permettre à l'humain de repérer hallucinations et ajouts indésirables (L9, L41).
- Auditer les décisions humaines : validations, modifications du design, décisions sur les écarts.

## Options envisagées

### Option A — Pas de journal, seul l'état courant est stocké

- Inconvénient : impossible de savoir quelle action a produit une donnée ni de la comparer à la demande.
- **Écartée** : contraire au besoin de suivi et d'auto-correction (L15–17).

### Option B — Journal de chaque appel d'outil MCP

- Avantage : suivi en temps réel (L15).
- Avantage : l'IA peut relire son historique et comparer la demande avec ce qu'elle a fait (L17).
- Inconvénient : volume de données à stocker et à afficher.
- **Retenue**, étendue aux actions humaines (option D).

### Option C — Journal des appels MCP et audit des actions humaines séparés

- Inconvénient : deux historiques à croiser pour comprendre comment une donnée a évolué.
- **Écartée.**

### Option D — Un historique unique pour l'IA et les humains

- Avantage : une seule chronologie montre qui a fait quoi et quand, et relie une décision humaine à l'action de l'IA qu'elle valide ou corrige.
- Inconvénient : l'historique mêle des entrées de nature différente, à filtrer à l'affichage.
- **Retenue.**

## Décision

### 1. Chaque appel d'outil MCP est journalisé

Lecture comme écriture, chaque appel au MCP de la plateforme laisse une entrée dans le journal.

### 2. Le journal est consultable en temps réel par l'humain

L'interface affiche les appels au fil de l'eau (L15).

### 3. Le journal est lisible par l'IA via le MCP, page par page

L'IA peut relire son historique pour se corriger quand on lui demande de comparer la demande et ce qu'elle a fait (L17). La lecture est paginée par curseur : l'IA récupère une page, puis la suivante si elle en a besoin, sans jamais recevoir tout l'historique d'un coup.

### 4. Les actions humaines entrent dans le même historique

Validations, modifications du design et décisions sur les écarts de régression visuelle (ADR 0005 §5) laissent une entrée dans le même historique que les appels MCP.

### 5. Chaque entrée dit qui a agi

Une entrée indique son auteur, l'IA ou un humain identifié, et sa date. L'historique sert d'audit.

## Conséquences

### Positives

- Chaque donnée de la base est rattachée à l'action qui l'a produite.
- L'auto-correction de l'IA s'appuie sur des faits et non sur sa mémoire de conversation.
- Une seule chronologie sert au suivi de l'IA et à l'audit des décisions humaines.

### Négatives

- Le journal grossit avec chaque appel, lectures comprises.
- Le journal contient ce que l'IA du client envoie, donc des données de projet du client.
- Chaque action humaine doit être rattachée à un utilisateur identifié.

### Risques et mitigations

- **Journal trop volumineux pour être relu par l'IA** : tout charger d'un coup pollue son contexte et coûte des tokens au client, à l'encontre de la promesse de la plateforme. Mitigation : lecture paginée par curseur (§3).

## Notes d'implémentation

Le journal existant de l'outil est conservé et exposé à la fois dans le dashboard et comme outil de lecture du MCP.

## Liens

- [ADR 0001](0001-plateforme-centrale-de-design-plutot-que-pont-figma-code.md) — le journal sert la relecture humaine.
- [ADR 0002](0002-ia-du-client-via-mcp-sans-ia-embarquee.md) — les appels journalisés viennent de l'IA du client.
- [ADR 0005](0005-regression-visuelle-des-snapshots-envoyes-par-la-ci.md) — les décisions sur les écarts entrent dans l'historique.
- [Synthèse de la discussion du 13/10/2026](../synthese.md)
