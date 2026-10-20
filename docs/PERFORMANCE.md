# Performance

## Baselines & Budgets

| Mesure                                   | Départ (2026-10-20, local)   | Budget            | Gate               |
| ---------------------------------------- | ---------------------------- | ----------------- | ------------------ |
| Import Figma de bout en bout, 130 tokens | ≈ 275 s (≈ 2,1 s par token)  | — (hors de dezyn) | aucune             |
| Temps de dezyn dans cet import           | ≈ 0,5 s, 11 appels `/v1/mcp` | —                 | aucune             |
| Appel `/v1/mcp` le plus lent             | 100 ms                       | < 200 ms en local | à poser en phase 8 |

Outil de mesure : les logs `request` de l'API (`durationMs`, `src/platform/request-context.ts`), capturés pendant un import réel. Les durées sont celles du serveur ; les attentes entre deux appels viennent de l'horodatage des lignes.

Gate des budgets : `perf-pr.yml` compare les micro-benchs (`pnpm bench`, fichiers `*.bench.ts`) à la référence de `main` (`perf-main.yml`), à titre informatif. Les premiers benchs arrivent en phase 8.

## Load Reality

La charge réelle se mesure à la mise en production.

## Profile Findings

| Point chaud                                 | Mesure                  | Cause probable                              | Correction                                                                            | Statut     |
| ------------------------------------------- | ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- |
| Attentes de 37 à 90 s entre deux appels MCP | logs `request` de l'API | l'IA lit Figma et rédige le JSON des tokens | choix de produit : moins d'allers-retours, lots plus gros, format d'import (ADR 0003) | à discuter |

## Optimization Ledger

| Changement | Avant | Après | Verdict (garder/annuler) | Date |
| ---------- | ----- | ----- | ------------------------ | ---- |
