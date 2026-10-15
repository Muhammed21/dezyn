# Plans

Un plan par capacité, une tranche par PR. Ordre de réalisation :

| Ordre | Plan                                            | Dépend de                     | ADR                    |
| ----- | ----------------------------------------------- | ----------------------------- | ---------------------- |
| 1     | [Socle de l'API](socle-api.md)                  | —                             | 0007, 0008, 0009, 0020 |
| 2     | [Connexion de l'IA au MCP](connexion-ia-mcp.md) | Socle de l'API                | 0007, 0008, 0018       |
| 3     | [Espaces et membres](espaces-et-membres.md)     | Connexion de l'IA au MCP (S1) | 0011, 0017             |
| 4     | [Historique](historique.md)                     | Espaces et membres (S2)       | 0004, 0015, 0019       |

Les plans 2 et 3 peuvent avancer en parallèle une fois la tranche 1 du plan 2 fusionnée.

Chaque tranche suit RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR. Les critères d'acceptation d'une tranche sont validés avant d'écrire le premier test, et chaque commit attend une approbation.

Un plan terminé est supprimé.
