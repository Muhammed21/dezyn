# @repo/lint

Plugin oxlint local des règles d'architecture de l'API (ADR 0020, ADR 0022), chargé par `jsPlugins` dans `.oxlintrc.json` sous le nom `dezyn`. Toute modification passe en revue `critical`.

| Règle                           | Refuse                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dezyn/module-boundaries`       | un import d'un module de `apps/api/src/modules/` vers l'intérieur d'un autre, hors de son `contracts/`                                                    |
| `dezyn/layer-dependencies`      | un import qui remonte les couches : `presentation` et `infrastructure` → `application` → `domain`, `contracts` → `domain`                                 |
| `dezyn/no-disable-architecture` | un commentaire `oxlint-disable` / `eslint-disable` qui vise une règle `dezyn/`, ou toutes                                                                 |
| `dezyn/pure-domain`             | dans `domain/`, tout import de paquet (`node:` compris) ou hors de `apps/api/src/modules/` ; dans `contracts/`, tout paquet autre que `zod` (ADR 0022 §1) |

`src/config.test.ts` vérifie que chaque motif `files` des `overrides` correspond à au moins un fichier du dépôt, puis lance le vrai `oxlint` avec la vraie configuration sur une arborescence temporaire. `pnpm mutation` mute les règles contre leurs tests `RuleTester`.

Une directive `-line` désactive aussi le signalement de `dezyn/no-disable-architecture`, qui tombe sur la même ligne : aucune règle oxlint ne voit ce que sa propre suppression cache. `src/repository.test.ts` refait donc ce contrôle hors d'oxlint, sur tous les fichiers suivis par git, en lisant les vrais commentaires avec `oxc-parser`.
