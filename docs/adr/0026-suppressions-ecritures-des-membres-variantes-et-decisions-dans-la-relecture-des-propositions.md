# 0026 — Suppressions, écritures des membres, variantes et décisions dans la relecture des propositions

- Statut : Accepté
- Date : 2026-10-17
- Décideurs : Muhammed
- Amende : ADR 0012 (§1 : une proposition peut aussi être une suppression, et la donnée relue d'un composant est chacune de ses variantes et le composant lui-même ; §2 : un membre ne modifie un token fixé par une décision validée que par une nouvelle décision ; §5 : une décision et ses tokens forment une seule proposition, et un token fixé par une décision validée ne change que par une nouvelle décision), ADR 0013 (§6 et §8 : l'écriture ou la suppression directe d'un membre remplace aussi la proposition en attente), ADR 0024 (§4 : un token fixé par une décision validée et divergent avec Figma ne reçoit pas de proposition)

## Contexte et problématique

Toute écriture de l'IA est une proposition (ADR 0012 §1) ; tant qu'elle attend, la valeur validée continue de faire foi (ADR 0012 §3). Une donnée écrite par un membre est validée d'emblée (ADR 0012 §2). Une nouvelle proposition, ou le retour de l'IA à la valeur validée, remplace la proposition en attente sur la même donnée (ADR 0013 §6 et §8).

Cinq scénarios ne sont pas couverts, ou le sont mal :

- **Suppression par l'IA.** Le designer retire `brand.legacy` du Figma ; à la lecture suivante, l'IA veut la retirer de dezyn (ADR 0003 §4). L'ADR 0012 §1 ne couvre que la création et la modification.
- **Écriture d'un membre sur une donnée qui a une proposition en attente.** L'IA a proposé `color.primary = #F00` ; avant relecture, Léa, éditrice, écrit `#E00` dans l'interface, validée d'emblée (ADR 0012 §2). Les ADR 0013 §6 et §8 ne traitent que les écritures de l'IA. La spec #28 demandait, elle, de relire d'abord la proposition au lieu de l'écraser.
- **Granularité de la relecture d'un composant.** Le bouton a 6 variantes ; l'IA modifie le rayon de « primaire désactivé », puis dix minutes plus tard la couleur de « secondaire ». Si la donnée relue est le composant, la seconde proposition remplace la première (ADR 0013 §6) et le rayon disparaît de la relecture. L'ADR 0014 mesure la conformité par variante, l'ADR 0022 §5 fait du composant et de sa version validée un agrégat ; aucun ne dit ce qui se relit.
- **Une décision et ses tokens.** Lot A : la décision « corps en Manrope » et `font.body = Manrope`. Le lendemain, lot B : l'IA propose `font.body = Inter`. Par l'ADR 0013 §6, la proposition du token dans le lot A est remplacée ; la décision reste en attente sans son token et contredit le lot B. Autre cas : la décision Manrope est validée, l'IA propose seule `font.body = Inter` ; si l'éditeur valide, la mémoire de la direction artistique contredit le design, le risque que l'ADR 0012 §5 voulait éviter.
- **Un token fixé par une décision et divergent avec Figma.** La décision validée « corps en Manrope » fixe `font.body` ; l'IA trouve Inter dans Figma. L'ADR 0024 §4 lui fait écrire la valeur de Figma comme proposition, alors que l'IA ne sait pas pourquoi Figma diffère.

Décisions prises lors de la séance de domain modeling des 2026-10-16 et 2026-10-17.

Problématique : comment se proposent les suppressions de l'IA, que devient une proposition en attente quand un membre écrit sur la même donnée, qu'est-ce qui se relit dans un composant, et comment une décision et ses tokens restent-ils liés, y compris face à Figma ?

## Facteurs de décision

- La valeur validée fait foi tant qu'une proposition attend (ADR 0012 §3).
- Le membre fait autorité sur ce qu'il écrit (ADR 0012 §2).
- Une donnée a au plus une proposition en attente (ADR 0013 §6).
- Une même règle vaut pour la création, la modification et la suppression.
- Une proposition ne disparaît pas de la relecture parce que l'IA modifie une autre partie du même composant.
- La conformité se mesure par variante (ADR 0014).
- La mémoire de la direction artistique ne contredit pas le design (ADR 0012).
- Une suppression ne laisse pas de référence vers un token absent (même esprit que l'ADR 0010 §4).
- La friction reste ciblée sur ce qui la justifie.

## Options envisagées

### A. L'IA supprime une donnée

#### Option A1 — Une suppression par l'IA est une proposition

- Avantage : une même règle pour la création, la modification et la suppression ; la donnée validée fait foi tant que la suppression attend.
- **Retenue.**

#### Option A2 — Seul un membre peut supprimer

- Avantage : aucune suppression ne vient de l'IA.
- Inconvénient : une donnée retirée du Figma reste dans dezyn tant qu'un membre ne la supprime pas lui-même, et l'IA ne tient plus dezyn à jour (ADR 0003 §4).
- **Écartée.**

### B. Un membre écrit sur une donnée qui a une proposition en attente

#### Option B1 — La proposition passe à Remplacée, l'écriture du membre l'emporte

- Avantage : le membre fait autorité (ADR 0012 §2).
- Avantage : une seule règle pour la création et la modification, et au plus une proposition en attente par donnée (ADR 0013 §6).
- Inconvénient : le membre peut écraser une proposition qu'il n'a pas vue.
- **Retenue.** Le risque d'écraser sans voir est couvert sans blocage : la réponse de l'écriture désigne la proposition remplacée, qui reste visible dans son lot et dans l'historique.

#### Option B2 — La proposition reste en attente, et l'éditeur la relit face à la nouvelle valeur

- Avantage : rien de ce qu'a écrit l'IA ne disparaît de la relecture.
- Inconvénient : l'éditeur relit une proposition face à une valeur qu'un membre vient de choisir en connaissance de cause, une relecture pour rien ; la donnée garde deux versions concurrentes.
- **Écartée** : le membre fait autorité (ADR 0012 §2).

#### Option B3 — L'écriture du membre est refusée tant que la proposition n'est pas relue

C'était le choix de la spec #28 : relire d'abord la proposition au lieu de l'écraser.

- Avantage : le membre voit la proposition avant d'écrire.
- Inconvénient : trois étapes pour le même résultat : aller dans le lot, rejeter la proposition, revenir écrire.
- **Écartée** : Muhammed a confirmé l'option B1.

### C. Ce qui se relit : le composant ou la variante

#### Option C1 — Le composant entier est la donnée relue

Une proposition par composant.

- Inconvénient : deux modifications de variantes différentes se remplacent (ADR 0013 §6), et la première disparaît de la relecture.
- **Écartée.**

#### Option C2 — La variante est la donnée relue

- Avantage : deux modifications de variantes différentes restent deux propositions à relire.
- Avantage : cohérent avec la conformité par variante (ADR 0014).
- Inconvénient : un changement commun à toutes les variantes produit autant de propositions que de variantes.
- **Retenue.**

### D. Une décision et ses tokens

#### Option D1 — La règle ne vise que l'IA

- Avantage : un membre modifie librement un token fixé par une décision.
- Inconvénient : la mémoire de la direction artistique ment dès qu'un humain touche au token, et l'IA suivante ne sait plus qui croire. Les humains sont la source la plus probable de dérive.
- **Écartée.**

#### Option D2 — La règle vaut pour l'IA et pour les membres

- Avantage : la mémoire de la direction artistique ne contredit jamais le design, quel que soit l'auteur.
- Avantage : friction ciblée sur les seuls tokens fixés par une décision ; l'interface demande une justification d'une ligne au moment de la modification.
- Inconvénient : un membre qui veut juste essayer une autre police écrit une ligne de justification.
- **Retenue.**

### E. Un token fixé par une décision validée et divergent avec Figma

#### Option E1 — L'IA propose une nouvelle décision qui adopte la valeur de Figma

- Avantage : l'éditeur valide ou rejette la valeur de Figma en un clic, comme pour un autre token divergent.
- Inconvénient : l'IA ne sait pas pourquoi Figma diffère ; sa justification serait « aligné sur Figma », qui n'est pas une raison de design, et remplirait la mémoire de la direction artistique de décisions creuses.
- **Écartée.**

#### Option E2 — L'IA déclare l'état divergent, sans proposition

- Avantage : un humain tranche : soit il écrit une nouvelle décision dans dezyn, soit c'est Figma qui est à corriger.
- Inconvénient : le token reste divergent tant qu'un humain n'a pas tranché.
- **Retenue.**

## Décision

### 1. Une suppression par l'IA est une proposition

Une suppression d'un token, d'un composant, d'une variante ou d'une décision écrite par l'IA est une proposition, comme une création ou une modification. Tant qu'elle attend, la donnée validée continue de faire foi (ADR 0012 §3). Elle suit les règles de remplacement de l'ADR 0013 §6 et §8.

### 2. Un token encore référencé ne se supprime pas

La suppression d'un token encore référencé, par un alias `{…}` ou par une décision validée, est refusée, avec un message qui nomme les références, que la suppression vienne de l'IA ou d'un membre. L'IA propose d'abord, dans le même lot, de modifier ce qui y fait référence ; un membre les modifie d'abord.

### 3. Supprimer un token le retire de tous les modes

Un token supprimé disparaît de tous les modes ; chaque mode déclare toujours les mêmes tokens (ADR 0010 §4).

### 4. L'écriture directe d'un membre remplace la proposition en attente

Quand un membre écrit ou supprime directement une donnée qui a une proposition en attente, cette proposition passe au statut Remplacée dans son lot d'origine, et l'écriture du membre est validée d'emblée (ADR 0012 §2). La réponse de l'écriture désigne la proposition remplacée, qui reste visible dans son lot et dans l'historique.

Quand la proposition remplacée contient une décision en attente avec ses tokens (§6), c'est la proposition entière qui passe à Remplacée, et la réponse précise qu'elle contenait une décision.

### 5. La variante est la donnée relue

Chaque variante d'un composant a sa propre version validée et au plus une proposition en attente. Le composant lui-même (nom, description, définition de ses propriétés) est une donnée à part, avec la même règle. Ajouter une variante est une proposition de création. Un changement commun à toutes les variantes produit une proposition par variante, dans le même lot. Le composant reste l'agrégat de l'ADR 0022 §5, qui regroupe ses variantes.

### 6. Une décision et ses tokens forment une seule proposition

Une décision et les tokens qu'elle fixe forment une seule proposition. Proposer à nouveau un de ses tokens, c'est proposer une nouvelle version de la décision entière, qui remplace l'ancienne (ADR 0013 §6). Une décision et ses tokens ne se séparent pas entre deux lots.

### 7. Un token fixé par une décision validée ne change que par une nouvelle décision

Un token fixé par une décision validée ne change que par une nouvelle décision, avec sa justification. Une proposition qui modifie seule un tel token est refusée, avec un message qui nomme la décision.

Une décision proposée ne fait pas foi (ADR 0012 §1) et ne fixe encore aucun token : écrire un token d'une décision en attente est une écriture ordinaire, qui remplace la proposition entière (§4).

### 8. La règle vaut pour les membres

Un membre qui modifie un token fixé par une décision validée donne une justification d'une ligne au moment de la modification ; l'interface crée la nouvelle décision, validée d'emblée (ADR 0012 §2).

### 9. Un token fixé par une décision validée et divergent avec Figma ne reçoit pas de proposition

Quand l'IA trouve dans Figma une valeur différente pour un token fixé par une décision validée, elle déclare l'état divergent (ADR 0024 §1) sans écrire la valeur de Figma comme proposition. Un humain tranche : il écrit une nouvelle décision dans dezyn (§8), ou c'est Figma qui est à corriger. Pour un token qu'aucune décision validée ne fixe, l'ADR 0024 §4 s'applique tel quel.

## Conséquences

### Positives

- Une donnée retirée du Figma se retire de dezyn par la même relecture qu'une création ou une modification.
- Aucune suppression ne laisse d'alias ou de décision pointer vers un token absent.
- Un membre écrit sans passer par le lot pour rejeter d'abord la proposition ; une donnée garde au plus une proposition en attente.
- Deux modifications de variantes différentes restent toutes deux à relire, et la relecture suit la granularité de la conformité (ADR 0014).
- La mémoire de la direction artistique ne contredit pas le design, que l'auteur soit l'IA ou un membre.

### Négatives

- Une proposition peut être remplacée par un membre sans avoir été relue.
- Un changement commun à toutes les variantes produit autant de propositions à relire que de variantes.
- Le composant et chacune de ses variantes ont chacun une version validée et une proposition en attente à stocker et à afficher.
- Supprimer un token référencé demande à l'IA de modifier d'abord, dans le même lot, tout ce qui y fait référence.
- Un membre qui veut juste essayer une autre police sur un token fixé par une décision écrit une ligne de justification.
- L'IA ne peut plus proposer seul un token fixé par une décision validée.
- Un token fixé par une décision validée et divergent avec Figma reste divergent tant qu'un humain n'a pas tranché.

### Risques et mitigations

- **Un membre écrase une proposition sans la voir** : la réponse de l'écriture désigne la proposition remplacée, qui reste visible dans son lot et dans l'historique (§4).
- **Une suppression laisse une référence vers un token absent** : la suppression est refusée, avec un message qui nomme les références (§2).
- **Une modification de variante disparaît de la relecture** : chaque variante a sa propre proposition en attente (§5).
- **Une décision reste en attente sans son token, ou la mémoire de la direction artistique contredit le design** : une décision et ses tokens forment une seule proposition (§6), et un token fixé par une décision validée ne change que par une nouvelle décision (§7, §8).

## Notes d'implémentation

Une proposition porte sa donnée cible (token, composant, variante, ou décision avec ses tokens) et son genre : création, modification ou suppression. Les refus du §2 et du §7, et le remplacement du §4, vivent dans les use-cases d'écriture partagés par le MCP et l'API (ADR 0007 §3), à côté de la comparaison à la valeur validée et du remplacement de l'ADR 0013 (notes d'implémentation).

## Liens

- [ADR 0012](0012-les-ecritures-de-l-ia-sont-des-propositions-relues-par-un-editeur.md) — amende §1 (suppression, donnée relue d'un composant), §2 (token fixé par une décision) et §5 (une décision et ses tokens forment une proposition).
- [ADR 0013](0013-lots-de-propositions-declares-par-l-ia-propositions-remplacees-et-ecritures-identiques.md) — amende §6 et §8 : l'écriture ou la suppression directe d'un membre remplace aussi la proposition en attente.
- [ADR 0024](0024-l-etat-figma-d-un-token-est-declare-par-l-ia-du-client.md) — amende §4 : pas de proposition pour un token fixé par une décision validée (§9).
- [ADR 0003](0003-import-export-orchestres-par-les-mcp-du-client.md) — chaque lecture de Figma alimente dezyn, suppressions comprises (§4).
- [ADR 0010](0010-tokens-au-format-dtcg-modes-par-le-resolver.md) — chaque mode déclare les mêmes tokens (§4) ; les alias `{…}`.
- [ADR 0014](0014-la-conformite-se-mesure-contre-la-version-validee-d-un-composant.md) — la conformité se mesure par variante, contre sa version validée.
- [ADR 0022](0022-architecture-hexagonale-a-coeur-fonctionnel-pour-le-backend.md) — le composant reste l'agrégat qui regroupe ses variantes (§5).
