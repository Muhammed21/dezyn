# Plans

Un plan par capacité, une tranche par PR. Ordre de réalisation :

| Ordre | Plan                                              | Dépend de                                    | ADR                                                              |
| ----- | ------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| 6     | [Lots de propositions](lots-de-propositions.md)   | —                                            | 0004, 0007, 0010, 0012, 0013, 0017, 0021, 0022, 0023, 0025, 0026 |
| 7     | [État Figma des tokens](etat-figma-des-tokens.md) | Lots de propositions (tranches 1, 2, 4 et 5) | 0003, 0010, 0012, 0013, 0017, 0021, 0022, 0023, 0024             |

Chaque tranche suit RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR. Les critères d'acceptation d'une tranche sont validés avant d'écrire le premier test, et chaque commit attend une approbation.
