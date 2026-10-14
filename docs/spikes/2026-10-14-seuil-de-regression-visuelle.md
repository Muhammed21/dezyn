# Spike — seuil par défaut de la régression visuelle

- Date : 2026-10-14
- Origine : [ADR 0005](../adr/0005-regression-visuelle-des-snapshots-envoyes-par-la-ci.md), § Risques et mitigations : « La valeur par défaut (0,1 / 0,1 %) […] reste à confirmer sur de vrais composants, la conformité comparant deux rendus différents. »
- Durée : une session
- Code du spike : jetable, non versionné. Les extraits utiles sont reproduits ici.

## Question

Le seuil par défaut de l'ADR 0005 (tolérance de couleur 0,1 par pixel, échec au-delà de 0,1 % de pixels différents) laisse-t-il passer le bruit de rendu entre la plateforme et le code du client, tout en faisant échouer les petits défauts visuels qu'un designer refuserait ?

## Réponse courte

À remplir après la session : seuil confirmé, ou ajustement proposé avec ses valeurs.

## Montage

À relever pendant la session, pour pouvoir refaire la mesure :

- Machine et système d'exploitation, local et CI.
- Navigateur et version exacte utilisés pour les captures.
- Bibliothèque de diff et version exacte (pixelmatch ou équivalent), avec `threshold: 0.1` et la détection d'anticrénelage active.
- Conditions de capture, identiques des deux côtés : taille d'écran, densité de pixels à 1, polices chargées avant capture, animations et transitions désactivées, état du composant (repos, survol, focus).
- Les 5 à 10 composants retenus et leurs dimensions en pixels, du plus petit (bouton) au plus grand (section de page).

## Constats

### Sonde 1 — bruit de conformité

Même composant, rendu dans la plateforme et dans un code qui l'implémente fidèlement. Attendu : sous 0,1 %.

| Composant | Dimensions | Pixels différents | %   | Sous le seuil ? |
| --------- | ---------- | ----------------- | --- | --------------- |
|           |            |                   |     |                 |

### Sonde 2 — bruit de régression

Même code, capturé deux fois : une fois en local, une fois en CI. Attendu : proche de 0 %.

| Composant | Pixels différents | %   | Sous le seuil ? |
| --------- | ----------------- | --- | --------------- |
|           |                   |     |                 |

### Sonde 3 — défauts volontaires

Chaque défaut est introduit seul dans le code, puis comparé au rendu de la plateforme. Attendu : au-dessus de 0,1 %.

| Défaut                                     | Composant | %   | Détecté ? |
| ------------------------------------------ | --------- | --- | --------- |
| Bordure plus épaisse de 1 px               |           |     |           |
| Rayon d'angle modifié de 2 px              |           |     |           |
| Espacement intérieur modifié de 2 px       |           |     |           |
| Couleur proche (ex. `#FF0000` → `#F50000`) |           |     |           |
| Police différente (Poppins → Manrope)      |           |     |           |
| Ombre modifiée                             |           |     |           |

### Sonde 4 — effet de la taille du composant

Un seuil en pourcentage dépend de la surface : 0,1 % d'un bouton de 120×40 px fait environ 5 pixels, 0,1 % d'une section de 1440×800 px fait environ 1 150 pixels. Refaire le défaut « bordure de 1 px » sur le plus petit et le plus grand composant. Attendu : détecté sur les deux.

| Composant | Dimensions | Pixels du défaut | %   | Détecté ? |
| --------- | ---------- | ---------------- | --- | --------- |
|           |            |                  |     |           |

### Sonde 5 — tolérance de couleur

Une couleur proche peut rester sous la tolérance de 0,1 et ne compter aucun pixel différent. Mesurer l'écart de couleur minimal détecté. Attendu : un écart qu'un designer remarquerait est détecté.

## Recommandation

À remplir après la session, une action par point. Si le seuil change, proposer un amendement de l'ADR 0005, jamais une modification silencieuse.

## Ce que le spike n'a pas vérifié

À compléter après la session. Déjà hors périmètre :

- Les composants animés au-delà de leur état figé.
- Les rendus sur d'autres navigateurs que celui retenu.
- Les composants qui changent de mise en page selon la taille d'écran.
