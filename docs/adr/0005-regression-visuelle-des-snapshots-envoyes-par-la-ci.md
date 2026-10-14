# 0005 — Régression visuelle des composants à partir des snapshots envoyés par la CI, comparés au design et au dernier snapshot validé

- Statut : Accepté
- Date : 2026-10-14
- Décideurs : Muhammed

## Contexte et problématique

La plateforme est la source de vérité du design et stocke chaque composant en web réel (ADR 0001). Rien ne vérifie que le composant codé dans le repo du client correspond à ce qui a été demandé dans le design, ni qu'il ne dérive pas au fil des PR.

L'objection « le repo comme concurrent » reste ouverte (ADR 0001) : l'IA lit déjà bien le code.

Les projets clients produisent des snapshots visuels de leurs composants dans leur CI.

Problématique : comment la plateforme vérifie-t-elle que le composant codé correspond au design et ne régresse pas ?

## Facteurs de décision

- Pas de LLM côté plateforme (ADR 0002).
- Pas d'intégration d'API tierce dans la plateforme (ADR 0003).
- Résultat reproductible, sans coût de tokens pour le client.
- Écart visible par le développeur au moment de la PR.

## Options envisagées

### Qui compare

#### Option A — Comparaison déterministe d'images par la plateforme

L'outil ne lit pas le code du composant : il compare l'image du snapshot visuel à une image de référence.

- Avantage : reproductible, gratuit, compatible avec l'ADR 0002.
- **Retenue.**

#### Option B — L'IA du client compare le code et le design

- Inconvénient : résultat variable selon l'IA, coût de tokens pour le client.
- **Écartée.**

#### Option C — Un LLM de la plateforme compare

- **Écartée** : contraire à l'ADR 0002 §1.

### Référence de comparaison

#### Option D — Le rendu du design dans la plateforme

- Avantage : répond à « ce qui a été codé correspond-il à ce qui a été demandé ? ».

#### Option E — Le dernier snapshot validé du code

- Avantage : détecte les régressions entre deux PR.
- Inconvénient : Chromatic et Percy le font déjà.

#### Option F — Les deux

- Avantage : un seul mécanisme de diff, deux références ; la conformité au design distingue l'outil, la régression vient presque gratuitement une fois les images stockées.
- **Retenue.**

### Arrivée de l'image

#### Option G — La plateforme récupère l'image via le lien GitHub

- Inconvénient : intégration de l'API GitHub (authentification, dépôts privés, quotas).
- **Écartée** : contraire à l'ADR 0003 §1.

#### Option H — La CI du client pousse l'image

- Avantage : automatique à chaque PR, déterministe, sans token, sans client GitHub à maintenir.
- Inconvénient : un point d'envoi d'images, distinct du MCP, à exposer et sécuriser.
- **Retenue.**

#### Option I — L'IA du client récupère et envoie l'image via le MCP

- **Écartée** : demande de lancer l'IA à chaque changement, coûte des tokens, images lourdes à faire transiter par le MCP.

### Usage du résultat

#### Option J — Rapport dans la plateforme seulement

- **Écartée** : rien ne force à regarder l'écart.

#### Option K — Statut renvoyé à la CI seulement

- **Écartée** : le développeur voit un échec sans voir l'image.

#### Option L — Les deux

- **Retenue.**

## Décision

### 1. La plateforme compare des images, jamais du code

L'outil fait une comparaison déterministe, sans LLM, entre l'image du snapshot visuel d'un composant et une image de référence.

### 2. Deux références par composant

- **Conformité** : le rendu du composant tel que stocké dans la plateforme.
- **Régression** : le dernier snapshot du code validé par un humain.

### 3. La CI du client pousse le snapshot

Une étape de la CI envoie l'image à la plateforme à chaque PR, avec le lien GitHub du commit ou de la PR qui l'a produite. La plateforme n'appelle jamais GitHub.

### 4. Le verdict revient à la CI et s'affiche dans la plateforme

L'étape de CI reçoit le verdict et échoue au-delà d'un seuil d'écart, avec le lien vers le diff dans la plateforme. Le seuil est réglé par le développeur dans la configuration de l'étape de CI et envoyé avec l'image. Sans seuil fourni, la plateforme applique, pour la conformité comme pour la régression :

- une tolérance de couleur de 0,1 par pixel, qui ignore l'anticrénelage ;
- un échec dès que plus de 0,1 % des pixels diffèrent.

### 5. Un humain tranche chaque écart, et sa décision est tracée

- Écart de régression voulu : le snapshot devient la nouvelle référence de régression.
- Écart de conformité : on corrige le code, ou on change le design dans la plateforme. Un écart au design ne se valide pas depuis le code.

## Conséquences

### Positives

- La plateforme devient la référence contre laquelle le code est vérifié, et non une source concurrente du repo.
- Écart visible et chiffré au moment de la PR.
- Aucun coût de tokens, aucune intégration GitHub.

### Négatives

- Le client doit ajouter une étape à sa CI et produire des snapshots visuels.
- La plateforme expose un point d'envoi d'images en plus du MCP, avec son authentification.
- Stockage des images par composant et par PR.
- La régression seule recoupe Chromatic et Percy.

### Risques et mitigations

- **Faux écarts dus aux conditions de capture** (taille d'écran, état du composant, polices, animations) : les deux captures se font dans les mêmes conditions, figées et déclarées avec l'image.
- **Seuil mal réglé** (trop de bruit ou écarts manqués) : le développeur l'ajuste dans sa CI. La valeur par défaut (0,1 / 0,1 %) est stricte pour attraper une bordure décalée d'un pixel ; elle vient des réglages courants des outils de diff et reste à confirmer sur de vrais composants, la conformité comparant deux rendus différents.

## Notes d'implémentation

1. Point d'envoi d'images authentifié par projet, qui reçoit l'image, l'identifiant du composant, les conditions de capture et le lien GitHub.
2. Capture du rendu du composant dans la plateforme dans les mêmes conditions.
3. Diff d'images et verdict renvoyé à la CI avec le lien du diff.
4. Écran de décision humaine et trace dans l'historique (ADR 0004).

## Liens

- [ADR 0001](0001-plateforme-centrale-de-design-plutot-que-pont-figma-code.md) — le rendu stocké en web réel sert de référence de conformité ; répond à l'objection du repo concurrent.
- [ADR 0002](0002-ia-du-client-via-mcp-sans-ia-embarquee.md) — la comparaison se fait sans LLM.
- [ADR 0003](0003-import-export-orchestres-par-les-mcp-du-client.md) — la plateforme n'appelle pas GitHub.
- [ADR 0004](0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — les décisions sur les écarts entrent dans l'historique unique.
- [Spike — seuil par défaut de la régression visuelle](../spikes/2026-10-14-seuil-de-regression-visuelle.md) — confirme ou ajuste le seuil par défaut.
