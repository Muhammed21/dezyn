# Tests

## Test Strategy

- Unitaires (`pnpm test`) : domaine et contrats, sans base. 442 tests.
- Intégration (`pnpm test:integration`) : l'app entière en mémoire (`app.request()`), sur une vraie PostgreSQL, un fichier par comportement d'ADR. 510 tests.
- Mutation (`pnpm --filter @repo/api mutation`, Stryker en place, en local seulement) : mesure la force des tests ; seuils 90 / 100 %, sans blocage. `--mutate <fichiers>` restreint le run aux fichiers touchés.
- Bench (`pnpm bench`) : `apps/api/bench/*.bench.ts`, sur une vraie PostgreSQL ; voir [PERFORMANCE.md](PERFORMANCE.md).
- Vert = les deux suites en CI (`ci.yml`).

## Safety Net Map

| Flux                       | Comportements fixés                                                                                                                                                                                                                                                                                                        | Fichiers de test                                                                                                                                                   | Trous                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outils MCP de l'IA         | write_tokens en proposition et en lot, refus identiques à l'ajout d'un membre, une seule proposition en attente par donnée, lecture validée ou sur demande, declare_figma_states (remplacement, refus entier, doublon Figma), divergence Figma en proposition, historique et droits de chaque outil, écritures simultanées | proposal-mcp, proposal-batch, proposal-batch-expiry, proposal-reading, proposal-replacement, proposal-update, token-mcp, token-figma-state, token-figma-divergence | score de mutation du module proposal à mesurer                                                                                                                                    |
| Relecture des propositions | relecture lot par lot, un seul relecteur et une seule fois (y compris en simultané), validation d'un lot fermé cibles d'abord et tout ou rien, propositions remplacées ou rejetées exclues, valeur Figma validée ou rejetée, historique avec l'éditeur                                                                     | proposal-review, proposal-batch-validation, proposal-member-addition, token-figma-review                                                                           | score de mutation du module proposal à mesurer                                                                                                                                    |
| Lecture des tokens         | chaque type en dur, en référence et par mode, refus nommant le champ ou le mode, doublons (et non-doublons avec référence), références de champ, clés étrangères                                                                                                                                                           | token-addition, token-types, token-modes, token-references, token-field-references, token-duplicates, token-fonts-and-numbers                                      | survivants antérieurs : `postgres-tokens` (cible de `onConflictDoNothing`, `figmaVariables` hors doublon, liste des rejets), `not_found` d'un projet introuvable dans `add-token` |
| Auth et OAuth              | inscription et connexion, découverte et enregistrement de client avec limite, autorisation et consentement, refresh et réutilisation, retrait d'accès effectif à l'appel suivant, whoami                                                                                                                                   | identity.*, refresh-grant, client-registration                                                                                                                     | requête sans IP de client (repli de better-auth sur un compteur partagé) ; score de mutation du module identity à mesurer                                                         |

## Characterization Backlog

- [ ] Mesurer le score de mutation des modules space et history, et finir proposal et identity : un run partiel (498 mutants sur 1 175, 2026-10-20) compte 23 survivants et 2 timeouts, soit environ 95 % ; à relancer par module avant de remanier l'un d'eux, [#108](https://github.com/Muhammed21/dezyn/issues/108) (risque moyen, priorité moyenne)
- [ ] Tuer les survivants antérieurs de `postgres-tokens` et le `not_found` d'`add-token`, [#109](https://github.com/Muhammed21/dezyn/issues/109) (risque moyen, priorité moyenne)
- [x] Rendre `makeClientIp` assez large pour ne plus buter sur la limite d'inscription : PR #78, voir [TECH-DEBT.md](TECH-DEBT.md) (risque moyen, priorité haute)

## CI Gates

- `ci.yml` : `pnpm test` et `pnpm test:integration` bloquent le merge.
- Stryker tourne en local seulement : sur un diff de 10 fichiers, le run dépasse 60 min en CI, même sans les mutants statiques.
- `perf-pr.yml` et `perf-main.yml` comparent les benchs à la référence de `main`, à titre informatif, sans jamais bloquer ; un bench sans échantillon fait échouer le job.
