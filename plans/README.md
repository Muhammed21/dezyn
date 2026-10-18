# Plans

Un plan par capacité, une tranche par PR. Ordre de réalisation :

| Ordre | Plan                                                | Dépend de                                                                                 | ADR                                                              |
| ----- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 4     | [Historique](historique.md)                         | —                                                                                         | 0004, 0015, 0016, 0019, 0020, 0021, 0023, 0025                   |
| 5     | [Ajout manuel de tokens](ajout-manuel-de-tokens.md) | Historique (tranches 1 et 4), Lots de propositions (tranche 4, pour la tranche 6)         | 0004, 0010, 0011, 0012, 0017, 0019, 0020, 0022, 0023, 0026       |
| 6     | [Lots de propositions](lots-de-propositions.md)     | Ajout manuel de tokens (tranches 1, 3 et 5), Historique (tranche 4)                       | 0004, 0007, 0010, 0012, 0013, 0017, 0021, 0022, 0023, 0025, 0026 |
| 7     | [État Figma des tokens](etat-figma-des-tokens.md)   | Ajout manuel de tokens (tranches 1, 4 et 5), Lots de propositions (tranches 1, 2, 4 et 5) | 0003, 0010, 0012, 0013, 0017, 0021, 0022, 0023, 0024             |

Chaque tranche suit RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR. Les critères d'acceptation d'une tranche sont validés avant d'écrire le premier test, et chaque commit attend une approbation.
