# Plan d'optimisation de l'architecture

## Contexte

Démarré le 2026-10-20, avec le skill `architecture-optimization`.

- **Système** : l'API de dezyn. Une seule app Hono sert l'API HTTP, le MCP en Streamable HTTP et le serveur OAuth des apps d'IA (ADR 0007, 0008).
- **Stack** : Node, Hono, better-auth, Drizzle, PostgreSQL ; S3 et SMTP en dépendances sortantes.
- **Production** : la charge réelle se mesure à la mise en production.
- **Mesures** : posées en phase 1, en partant d'un ressenti de lenteur en local sur des appels précis.
- **Tests** : 366 unitaires et 402 d'intégration au vert, avec mutation testing par Stryker.
- **Structure** : modules et couches imposés par oxlint (ADR 0020), architecture hexagonale à cœur fonctionnel (ADR 0022).
- **Flux en périmètre** :
  - les outils MCP de l'IA (`write_tokens`, `read_tokens`, déclaration des états Figma) ;
  - la relecture des propositions ;
  - la lecture des tokens ;
  - l'auth et OAuth.
- **Étendue choisie** : audit de structure, phases 1 à 4. Les phases 5 à 8 sont reportées, chacune avec son déclencheur.
- **Rangement** : les fichiers du parcours vivent dans `docs/`. Les décisions vont en ADR (`docs/adr/`) et le vocabulaire dans `CONTEXT.md`. `ARCHITECTURE.md` y renvoie au lieu de dupliquer.

Mode : skills installés (wondelai/skills, installés le 2026-10-20).

## État des phases

| Phase | Skill                      | Statut                                                                                                                        | Artefact                                 | Date       |
| ----- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------- |
| 1     | working-with-legacy-code   | done                                                                                                                          | TESTING.md, TECH-DEBT.md, PERFORMANCE.md | 2026-10-20 |
| 2     | clean-architecture         | done (audit seul, sans changement ; 2 écarts reportés en phase 4)                                                             | ARCHITECTURE.md                          | 2026-10-20 |
| 3     | software-design-philosophy | done (audit seul, sans changement ; 3 défauts reportés en phase 4)                                                            | TECH-DEBT.md                             | 2026-10-20 |
| 4     | refactoring-patterns       | done                                                                                                                          | TECH-DEBT.md, TESTING.md                 | 2026-10-21 |
| 5     | system-design              | deferred: attend une charge réelle ; déclencheur : premiers utilisateurs, ou p95 d'un flux au-dessus de son budget de phase 1 | PERFORMANCE.md, ARCHITECTURE.md          | 2026-10-20 |
| 6     | ddia-systems               | deferred: même déclencheur que la phase 5 ; les N+1 et listes non paginées repérés en phases 2-3 vont au registre de dette    | ARCHITECTURE.md, PERFORMANCE.md          | 2026-10-20 |
| 7     | release-it                 | deferred: déclencheur : date de mise en production fixée                                                                      | RELIABILITY.md                           | 2026-10-20 |
| 8     | pragmatic-programmer       | deferred: déclencheur : phase 7 terminée                                                                                      | PERFORMANCE.md, TECH-DEBT.md, TESTING.md | 2026-10-20 |

Statuts : pending · in-progress · awaiting-evidence · done · deferred: <raison> · skipped: <raison>

## Décisions clés

| Date       | Phase  | Décision                                                                                               | Raison                                                                                                                                                                                                          |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-20 | Intake | Rester sur Hono, sans NestJS                                                                           | ADR 0008 : classes et décorateurs à l'opposé du style fonctionnel ; Hono suit les standards du web dont dépendent MCP et better-auth.                                                                           |
| 2026-10-20 | Intake | Ne pas reprendre l'arborescence de car_rental                                                          | Les couches de l'ADR 0020 couvrent déjà le même découpage hexagonal ; à reconsidérer plus tard : `presentation/http` et `presentation/mcp`, puis `infrastructure/<technologie>`, quand la taille le justifiera. |
| 2026-10-20 | Intake | Audit de structure d'abord, perf reportée                                                              | La charge réelle attend la mise en production, et des mesures en dev donneraient de faux chiffres.                                                                                                              |
| 2026-10-20 | Intake | Décisions en ADR, vocabulaire dans CONTEXT.md                                                          | Garder une seule source pour chaque chose ; ARCHITECTURE.md y renvoie.                                                                                                                                          |
| 2026-10-20 | 1      | Outil de mesure : les logs `request` de l'API pendant un import réel                                   | Déjà en place, sans code à ajouter ; sépare le temps de dezyn du temps de l'IA et de Figma.                                                                                                                     |
| 2026-10-20 | 1      | Budget : chaque appel `/v1/mcp` sous 200 ms en local                                                   | Le plus lent mesure 100 ms ; sous ce seuil, dezyn reste négligeable dans un import de plusieurs minutes.                                                                                                        |
| 2026-10-20 | 1      | Le goulot de l'import Figma est hors de dezyn                                                          | 0,5 s dans dezyn sur ≈ 275 s ; les leviers sont des choix de produit, à trancher à part (ADR 0003).                                                                                                             |
| 2026-10-20 | 1      | Filet de tests jugé suffisant pour l'audit, sans attendre la mutation complète de proposal et identity | Chaque règle d'ADR des 4 flux a son test d'intégration ; le run partiel de Stryker tourne autour de 95 % ; la mutation se refait par module avant d'en remanier un.                                             |
| 2026-10-20 | 2      | Les 2 écarts à la règle de dépendance se corrigent en phase 4, chacun dans son commit de structure     | Petits et sans urgence ; la mutation du module space se relance avant de toucher l'acceptation d'invitation.                                                                                                    |
| 2026-10-20 | 3      | Les 3 défauts de profondeur se corrigent en phase 4 ; convention : une politique vit à un seul endroit | La politique d'accès recopiée 6 fois est la seule fuite qui amplifierait un changement ; les deux autres sont petites.                                                                                          |
| 2026-10-20 | 4      | Avant chaque remaniement, mutation des seuls fichiers touchés                                          | Assez pour prouver le filet sur le code déplacé, sans le run complet d'un module.                                                                                                                               |
| 2026-10-20 | 4      | Les modules remaniés n'entrent pas dans les gates de CI                                                | Stryker reste manuel ; sa place en CI se décide en phase 8.                                                                                                                                                     |
| 2026-10-20 | 4      | Une PR par remaniement, et une PR pour les docs du parcours                                            | Revue courte, retour arrière simple.                                                                                                                                                                            |
| 2026-10-20 | 4      | La politique d'accès au projet vit dans `space`, avec un port de projet générique                      | `history` n'a plus besoin de `project` pour vérifier l'accès, ce qui prépare le port de projet propre à `history`.                                                                                              |

## Prochaines actions

- [x] Phase 4 : 5 remaniements de structure, PR #80, #81, #82 et #83 (Claude)
- [ ] Discuter des leviers produit de l'import Figma : allers-retours, taille des lots, format d'import (Muhammed)
- [ ] Vérifier que l'hébergeur de production pose `x-forwarded-for` pour better-auth (Muhammed, avant la mise en production)
