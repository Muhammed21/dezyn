# 0023 — Réponses ouvertes, enums ouverts et unions extensibles dans les contrats

- Statut : Accepté
- Date : 2026-10-15
- Décideurs : Muhammed

## Contexte et problématique

Les sorties de la plateforme sont lues par des clients qu'elle ne déploie pas : l'IA du client via le MCP (ADR 0002), la CI du client qui reçoit un verdict pour chaque snapshot (ADR 0005, 0014), et le front web. Les entrées et les sorties de chaque route et de chaque outil MCP sont décrites par des schémas Zod, dont la spec OpenAPI est générée (ADR 0008 §2).

Plusieurs sorties sont faites pour grandir : le verdict (conforme, écart, sans référence), les statuts d'une proposition (Proposée, Validée, Rejetée, Remplacée), les actions de l'historique. Avec un `z.object` strict, un `z.enum` fermé ou une union sans repli, un client qui valide la réponse échoue dès que la plateforme ajoute un champ, une valeur ou une variante.

Le projet `twitch` du même auteur a tranché cette question dans son ADR 0024, avec les helpers `openEnum` et `extensibleUnion` et un garde de conventions.

Problématique : comment s'écrivent les schémas de sortie pour qu'un ajout de la plateforme ne casse pas un client déjà en service ?

## Facteurs de décision

- Ajouter un champ, une valeur d'enum ou une variante en sortie ne casse aucun client existant.
- Une entrée inconnue reste refusée par la plateforme.
- La règle est vérifiée en CI, pas seulement en revue.

## Options envisagées

### Option A — Conventions de schéma vérifiées par un garde

Réponses ouvertes, enums ouverts et unions avec variante de repli, imposés par un test qui parcourt les schémas de sortie exportés.

- Avantage : un ajout en sortie ne casse aucun client, et un oubli échoue en CI.
- Inconvénient : des conventions à connaître et des types de sortie moins précis.
- **Retenue.**

### Option B — Versionner chaque changement de sortie

Une nouvelle version de route ou d'outil à chaque ajout.

- Avantage : les schémas restent stricts.
- Inconvénient : des versions multipliées pour de simples ajouts, que l'IA du client doit découvrir.
- **Écartée.**

### Option C — Aucune convention

- Avantage : rien à écrire.
- Inconvénient : chaque ajout en sortie peut casser un client en service, sans que rien ne le signale.
- **Écartée.**

## Décision

### 1. Les objets de sortie sont ouverts, les objets d'entrée stricts

Un schéma de sortie s'écrit avec `z.looseObject` : un client garde les clés inconnues sans échouer. Un schéma d'entrée reste un `z.object` strict : la plateforme refuse un champ inconnu.

### 2. Les enums de sortie sont ouverts

Tout enum transporté en sortie passe par `openEnum`, qui accepte les valeurs connues et toute autre chaîne. `z.enum` nu reste autorisé en entrée.

### 3. Les unions de sortie ont une variante de repli

Toute union de sortie passe par `extensibleUnion` et se termine par une variante de repli qui n'exige que le discriminant. Une union volontairement fermée porte `.meta({ closed: true })`, justifié en revue.

### 4. Un garde vérifie les schémas de sortie

Un test parcourt les schémas de sortie exportés par les `contracts/` des modules et échoue sur un objet fermé, un enum nu ou une union sans repli.

## Conséquences

### Positives

- La plateforme ajoute un verdict, un statut ou une action sans casser l'IA ni la CI du client.
- Un oubli de convention échoue en CI.

### Négatives

- Les types de sortie côté client sont moins précis : une valeur inconnue doit être traitée.
- Des conventions de plus à connaître pour écrire un contrat.

### Risques et mitigations

- **Le garde ne reconnaît pas un nouveau type de schéma** : il échoue sur tout type qu'il ne sait pas vérifier, au lieu de le laisser passer.
- **Une suppression ou un renommage en sortie casse quand même un client** : ces conventions ne couvrent que les ajouts ; une suppression ou un renommage reste un changement cassant, signalé en revue.

## Notes d'implémentation

- Repris de `twitch` (`packages/contracts/src/conventions`) : `openEnum`, `extensibleUnion`, `Uuid` et le garde `check-response`, adaptés aux `contracts/` des modules (ADR 0020).
- Sans objet pour dezyn : la normalisation des nullables et le transcodage des dates de l'ADR 0024 de `twitch`, propres au client Swift généré.

## Liens

- [ADR 0005](0005-regression-visuelle-des-snapshots-envoyes-par-la-ci.md) — la CI du client lit le verdict.
- [ADR 0008](0008-hono-pour-le-backend-better-auth-pour-l-authentification.md) — schémas Zod et spec OpenAPI.
- [ADR 0012](0012-les-ecritures-de-l-ia-sont-des-propositions-relues-par-un-editeur.md) — statuts d'une proposition.
- [ADR 0020](0020-modules-et-couches-de-l-api-imposes-par-des-regles-oxlint.md) — les schémas vivent dans `contracts/`.
- [ADR 0022](0022-architecture-hexagonale-a-coeur-fonctionnel-pour-le-backend.md) — les routes et outils partagent leurs contrats.
