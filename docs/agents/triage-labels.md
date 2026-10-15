# Labels de triage

**Type:** reference

Les skills parlent en termes de cinq rôles de triage canoniques, chacun porté par un label des GitHub Issues du dépôt.

| Label dans mattpocock/skills | Label chez nous          | Sens                                              |
| ---------------------------- | ------------------------ | ------------------------------------------------- |
| `needs-triage`               | `triage:needs-triage`    | Le mainteneur doit évaluer ce ticket              |
| `needs-info`                 | `question`               | En attente d'informations de la part de l'auteur  |
| `ready-for-agent`            | `triage:ready-for-agent` | Entièrement spécifié, prêt pour un agent autonome |
| `ready-for-human`            | `triage:ready-for-human` | Demande une implémentation humaine                |
| `wontfix`                    | `wontfix`                | Ne sera pas traité                                |

Quand un skill nomme un rôle (par exemple « appliquer le label de triage prêt pour un agent »), utiliser le label correspondant de ce tableau.

Le préfixe `triage:` suit la convention des labels `review:*`.

Les labels `triage:*` se créent sur GitHub (`gh label create`) avant leur première utilisation.
