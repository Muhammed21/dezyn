# 0040 — Le document Resolver exporté porte la version `2025.10` de la spécification publiée

- Statut : Proposé
- Date : 2026-10-28
- Décideurs : Muhammed Cavus
- Amende : ADR 0039 (§3 : la valeur de `version` du document Resolver)

## Contexte et problématique

L'ADR 0039 §3 fixe la `version` du document Resolver exporté à `2025-10-01`. Il s'appuyait sur une lecture du module Resolver qui se contredisait : `2025-10-01` dans le tableau des champs, `2025-11-01` au §4.1.2 (ADR 0010, risques).

Le module Resolver publié sur designtokens.org (version 2025.10, consulté le 2026-10-28) ne se contredit plus. Le tableau des champs racine donne le format `YYYY.MM` et « Must be `2025.10` » ; le §4.1.2 dit : « The document MUST provide a version at the root level, and it MUST be `2025.10` ». Aucune des deux valeurs retenues jusque-là ne passe un validateur qui applique ce texte.

L'export des projets à modes n'est pas encore livré (plan `plans/export-dtcg.md`, tranche 5) : aucun document Resolver n'est sorti de dezyn avec l'ancienne valeur.

Problématique : quelle valeur de `version` porte le document Resolver que dezyn exporte ?

## Facteurs de décision

- Un document exporté est lu sans perte par un outil conforme au module Resolver publié (ADR 0010 §2).
- Un ADR accepté ne se contredit pas en silence dans le code.
- Aucun document n'a encore été exporté avec l'ancienne valeur.

## Options envisagées

### Option A — `2025.10`, la valeur du module publié

- Avantage : le document passe un validateur conforme au texte publié.
- Inconvénient : un outil écrit d'après une lecture antérieure du module peut attendre une autre valeur.
- **Retenue.**

### Option B — Garder `2025-10-01`

- Avantage : l'ADR 0039 reste entier.
- Inconvénient : un validateur conforme au module publié refuse chaque export d'un projet à modes.
- **Écartée.**

## Décision

Le document Resolver exporté porte `version` à `2025.10`. Le reste de l'ADR 0039 §3 est inchangé.

## Conséquences

### Positives

- Un export à modes suit le texte publié du module Resolver.
- Le changement arrive avant tout export à modes : aucun document en circulation ne porte l'ancienne valeur.

### Négatives

- Un outil qui attend `2025-10-01` ou `2025-11-01` refuse le document.
- L'ADR 0039 se lit désormais avec cet amendement.

### Risques et mitigations

- **Le module change encore la valeur** : elle vit dans une seule constante ; un nouvel amendement la change.
- **L'import reçoit d'autres valeurs** : les valeurs acceptées à l'import restent un point ouvert (#167).

## Notes d'implémentation

1. La tranche 5 de `plans/export-dtcg.md` écrit `version: "2025.10"` dans le document Resolver.

## Liens

- [ADR 0039](0039-l-export-dtcg-imbrique-les-tokens-valides-et-decrit-les-modes-par-un-document-resolver.md) — amendé : la valeur de `version` du document Resolver (§3).
- [ADR 0010](0010-tokens-au-format-dtcg-modes-par-le-resolver.md) — les modes par le Resolver, et la contradiction du module sur `version` (risques).
