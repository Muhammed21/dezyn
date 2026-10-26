# Documentation

**Type:** reference

Comment la documentation est organisée, où la lire et où écrire.

## Carte

Le catalogue page par page — titre, mode, statut et objet de chaque page — est [`CATALOG.md`](CATALOG.md), généré par `pnpm generate`.

| Chemin        | Contenu                                                        | Mode        |
| ------------- | -------------------------------------------------------------- | ----------- |
| `CATALOG.md`  | Chaque page en une ligne (généré)                              | reference   |
| `synthese.md` | Synthèse de la discussion fondatrice du 13/10/2026             | reference   |
| `adr/`        | Décisions durables : contexte, options, décision, conséquences | explanation |
| `spikes/`     | Recherches bornées dans le temps, qui éclairent un ADR         | explanation |
| `runbooks/`   | Procédures d'exploitation, pas à pas                           | how-to      |

Le mode est le type [Diátaxis](https://diataxis.fr/) de la page : tutorial, how-to, reference ou explanation, un seul par page. Une page qui résiste à l'écriture mélange souvent deux modes : on la coupe en deux.

## Où va mon document ?

| J'écris…                                      | Ça va dans…                                                        |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Une décision technique ou produit durable     | `adr/`, au numéro suivant (règle `.claude/rules/adr-et-spikes.md`) |
| Une décision qui change une décision acceptée | Un nouvel ADR qui remplace l'ancien ; l'ancien ne se réécrit pas   |
| Une recherche qui doit aboutir à une décision | `spikes/AAAA-MM-JJ-sujet.md`                                       |
| Une procédure d'exploitation (déployer, …)    | `runbooks/`                                                        |
| Un plan de travail découpé en PR              | `plans/`, hors de `docs/` ; supprimé une fois livré                |

## En-tête des pages

Les ADR et les spikes ont leur propre en-tête en liste (`- Statut :`, `- Date :`, …), décrit dans `.claude/rules/adr-et-spikes.md`. Toute autre page ouvre, après son titre `# …`, sur une ligne en gras qui donne son mode, sans frontmatter YAML :

```markdown
**Type:** tutorial | how-to | reference | explanation
```

Le catalogue lit cette ligne ; sans elle, il déduit le mode du dossier.

## Hygiène des liens

La CI vérifie les liens internes (lychee hors ligne, `.github/workflows/docs.yml`).
