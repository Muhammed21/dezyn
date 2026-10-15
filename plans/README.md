# Plans

Un plan par capacité, une tranche par PR. Ordre de réalisation :

| Ordre | Plan                                            | Dépend de                                                            | ADR                                      |
| ----- | ----------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| 1     | [Socle de l'API](socle-api.md)                  | —                                                                    | 0007, 0008, 0009, 0020                   |
| 2     | [Connexion de l'IA au MCP](connexion-ia-mcp.md) | Socle de l'API                                                       | 0007, 0008, 0018, 0020, 0021             |
| 3     | [Espaces et membres](espaces-et-membres.md)     | Connexion de l'IA au MCP (tranche 4)                                 | 0011, 0015, 0017, 0020, 0021             |
| 4     | [Historique](historique.md)                     | Connexion de l'IA au MCP (tranche 4), Espaces et membres (tranche 2) | 0004, 0015, 0016, 0019, 0020, 0021, 0023 |

Les tranches 5 et 6 de la connexion avancent en parallèle du plan des espaces.

Chaque tranche suit RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR. Les critères d'acceptation d'une tranche sont validés avant d'écrire le premier test, et chaque commit attend une approbation.
