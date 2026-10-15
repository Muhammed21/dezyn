# 0014 — La conformité se mesure contre la version validée d'un composant

- Statut : Accepté
- Date : 2026-10-15
- Décideurs : Muhammed
- Amende : ADR 0005 (§2 : la référence de conformité est le rendu de la version validée ; §4 : le verdict vaut conforme, écart ou sans référence, et « sans référence » ne fait pas échouer la CI)

## Contexte et problématique

L'ADR 0005 §2 fait de la référence de conformité « le rendu du composant tel que stocké dans la plateforme ». Depuis l'ADR 0012, un composant stocké a une version validée et, à côté, des propositions en attente ; il peut aussi n'avoir encore aucune version validée, quand l'IA l'a créé et qu'aucun éditeur ne l'a relu.

L'ADR 0005 §4 renvoie un verdict à la CI du client, qui échoue au-delà d'un seuil d'écart. Il ne dit pas quel rendu sert de référence de conformité dans ces deux cas.

Décision prise lors de la séance de domain modeling du 2026-10-15.

Problématique : contre quel rendu un snapshot est-il comparé pour la conformité, quand une variante a des propositions en attente ou n'a encore aucune version validée ?

## Facteurs de décision

- Seules les données validées font foi pour le projet (ADR 0012 §1) : une donnée non relue ne fait pas passer la CI.
- Le développeur comprend pourquoi son snapshot est en écart.
- L'éditeur est poussé à relire les propositions qui bloquent le code.
- dezyn ne freine pas le développement du client tant que l'éditeur n'a pas relu.

## Options envisagées

### Référence quand une proposition est en attente

#### Option A — Comparer au rendu proposé

- Inconvénient : une donnée non relue ferait passer la CI.
- **Écartée.**

#### Option B — Comparer au rendu validé, sans signal

- Inconvénient : le développeur dont le snapshot correspond à la proposition ne comprend pas l'écart.
- **Écartée.**

#### Option C — Comparer au rendu validé, et signaler que le snapshot correspond à la proposition en attente

- Avantage : seule la version validée fait foi, et le développeur sait que l'écart se lève par la relecture de la proposition.
- **Retenue.**

### Variante sans version validée

#### Option D — Échouer, ou refuser le snapshot

- Inconvénient : dezyn freinerait le développement du client tant que l'éditeur n'a pas relu.
- **Écartée.**

#### Option E — Verdict « sans référence » pour la conformité, seule la régression est vérifiée

- Avantage : la CI du client avance, et la régression reste surveillée.
- **Retenue.**

## Décision

### 1. La référence de conformité est le rendu de la version validée

La référence de conformité d'une variante est le rendu de sa version validée, jamais celui d'une proposition.

### 2. Un snapshot qui correspond à la proposition en attente reste un écart, signalé comme tel

Si le snapshot correspond au rendu d'une proposition en attente, le verdict reste un écart. Le verdict et la plateforme signalent que « le snapshot correspond à la proposition en attente », pour pousser l'éditeur à la relire.

### 3. Une variante sans version validée reçoit le verdict « sans référence » pour la conformité

Une variante qui n'a encore aucune version validée reçoit le verdict « sans référence » pour la conformité. La CI n'échoue pas pour la conformité ; seule la régression est vérifiée.

### 4. Un écart de conformité ne s'accepte pas

Inchangé depuis l'ADR 0005 §5 : un écart de conformité se résout en corrigeant le code ou en modifiant le design dans la plateforme.

### 5. Le verdict vaut conforme, écart ou sans référence

Pour la conformité comme pour la régression, le verdict vaut **conforme**, **écart** ou **sans référence**. Seul un écart au-delà du seuil fait échouer la CI (ADR 0005 §4).

### 6. Le premier snapshot d'une variante ne bloque pas la CI

Le premier snapshot d'une variante n'a pas de référence de régression : il reçoit « sans référence » pour la régression, et attend qu'un éditeur le valide comme première référence de régression (ADR 0005 §2).

## Conséquences

### Positives

- Une donnée non relue ne fait jamais passer la CI du client pour la conformité.
- Le développeur sait quand son écart se résout par la relecture d'une proposition, et non en corrigeant son code.
- L'éditeur voit quelles propositions en attente bloquent la CI.
- Une variante tout juste créée par l'IA ne bloque pas le développement du client.

### Négatives

- Chaque verdict de conformité compare aussi le snapshot au rendu de la proposition en attente, quand il y en a une : un second rendu et un second diff.
- Le verdict a une valeur de plus, « sans référence », que l'étape de CI du client doit connaître.
- Le premier snapshot d'une variante ne protège encore de rien tant qu'un éditeur ne l'a pas validé comme référence de régression.
- Tant qu'une variante n'a pas de version validée, la CI du client ne vérifie pas que le code correspond au design.
- Valider une proposition de composant change la référence de conformité : les snapshots suivants sont comparés au nouveau rendu.

### Risques et mitigations

- **Une variante reste sans version validée, et le code n'est jamais vérifié contre le design** : la plateforme affiche le verdict « sans référence » (§3), et la relecture de la proposition qui crée la variante rend la conformité vérifiable. Le rappel à l'éditeur au-delà de cet affichage reste à trancher.
- **Le développeur prend l'écart pour une erreur de son code** : le verdict signale que le snapshot correspond à la proposition en attente (§2).

## Notes d'implémentation

Le rendu de la proposition en attente se capture dans les mêmes conditions que celui de la version validée (ADR 0005, notes d'implémentation, point 2). Une donnée a au plus une proposition en attente (ADR 0013 §6) : le signal du §2 porte sur celle-là.

## Liens

- [ADR 0005](0005-regression-visuelle-des-snapshots-envoyes-par-la-ci.md) — amende la référence de conformité (§2) et les valeurs du verdict (§4).
- [ADR 0012](0012-les-ecritures-de-l-ia-sont-des-propositions-relues-par-un-editeur.md) — seules les données validées font foi.
- [ADR 0013](0013-lots-de-propositions-declares-par-l-ia-propositions-remplacees-et-ecritures-identiques.md) — une donnée a au plus une proposition en attente.
- [ADR 0001](0001-plateforme-centrale-de-design-plutot-que-pont-figma-code.md) — le rendu stocké en web réel sert de référence de conformité.
