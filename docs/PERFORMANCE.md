# Performance

## Baselines & Budgets

| Mesure                                      | Départ (local, 2026-10-20 sauf mention)                    | Budget            | Gate                       |
| ------------------------------------------- | ---------------------------------------------------------- | ----------------- | -------------------------- |
| Import Figma de bout en bout, 130 tokens    | ≈ 275 s (≈ 2,1 s par token)                                | — (hors de dezyn) | aucune                     |
| Temps de dezyn dans cet import              | ≈ 0,5 s, 11 appels `/v1/mcp`                               | —                 | aucune                     |
| Appel `/v1/mcp` le plus lent                | 100 ms                                                     | < 200 ms en local | les deux benchs ci-dessous |
| `read_tokens`, projet de 130 tokens (bench) | médiane 5 ms, p99 7 ms (2026-10-21) ; CI : 17 ms, 24 ms    | < 200 ms en local | `perf-pr.yml`, informative |
| `write_tokens`, 130 propositions (bench)    | médiane 39 ms, p99 45 ms (2026-10-21) ; CI : 99 ms, 145 ms | < 200 ms en local | `perf-pr.yml`, informative |

Outil de mesure : les logs `request` de l'API (`durationMs`, `src/platform/request-context.ts`), capturés pendant un import réel. Les durées sont celles du serveur ; les attentes entre deux appels viennent de l'horodatage des lignes.

Gate des budgets : `perf-pr.yml` lance `pnpm bench` (`apps/api/bench/mcp.bench.ts`, sur une vraie PostgreSQL) et publie en commentaire de PR la médiane et le p99 face à la référence de `main` (`perf-main.yml`), à titre informatif. Un bench sans échantillon fait échouer le job : vitest bench avale l'erreur d'un bench, il se relance en local pour la voir. Le runner de CI est 3 fois plus lent que la machine locale ; le budget se lit sur les mesures locales.

## Load Reality

La charge réelle se mesure à la mise en production.

## Profile Findings

| Point chaud                                 | Mesure                  | Cause probable                              | Correction                                                                            | Statut     |
| ------------------------------------------- | ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- |
| Attentes de 37 à 90 s entre deux appels MCP | logs `request` de l'API | l'IA lit Figma et rédige le JSON des tokens | choix de produit : moins d'allers-retours, lots plus gros, format d'import (ADR 0003) | à discuter |

## Optimization Ledger

| Changement | Avant | Après | Verdict (garder/annuler) | Date |
| ---------- | ----- | ----- | ------------------------ | ---- |
