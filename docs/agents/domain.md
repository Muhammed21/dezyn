# Documentation du domaine

**Type:** reference

Comment les skills d'ingénierie lisent la documentation du domaine de ce dépôt quand ils explorent le code.

## Avant d'explorer, lire

- **`CONTEXT.md`** à la racine du dépôt.
- **`docs/adr/`** : les ADR qui touchent la zone sur laquelle on s'apprête à travailler. L'index et les statuts sont dans `docs/adr/README.md`.

Le skill `/mattpocock-skills:domain-modeling` (atteint via `/mattpocock-skills:grill-with-docs` et `/mattpocock-skills:improve-codebase-architecture`) les met à jour quand un terme ou une décision est réellement tranché.

## Structure des fichiers

Dépôt à contexte unique :

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-plateforme-centrale-de-design-plutot-que-pont-figma-code.md
│   └── 0002-ia-du-client-via-mcp-sans-ia-embarquee.md
├── apps/
└── packages/
```

## Utiliser le vocabulaire du glossaire

Quand une production nomme un concept du domaine (titre de ticket, proposition de refactoring, hypothèse, nom de test), employer le terme tel que `CONTEXT.md` le définit. Ne pas glisser vers des synonymes que le glossaire écarte explicitement.

Si le concept voulu n'est pas encore dans le glossaire, c'est un signal : soit on invente un langage que le projet n'emploie pas (à reconsidérer), soit il y a un vrai manque (à noter pour `/domain-modeling`).

### Dans le code

Le code est en anglais. Chaque terme du glossaire y a une seule traduction, celle de la table ci-dessous. Les listes _À éviter_ de `CONTEXT.md` valent pour la prose ; dans le code, tout synonyme de la traduction retenue est une faute, par exemple `admin`, `workspace`, `collaborator`, `baseline` ou `draft`.

| Terme du glossaire      | Code                   | À éviter dans le code                 |
| ----------------------- | ---------------------- | ------------------------------------- |
| Espace                  | `space`                | `workspace`, `organization`, `team`   |
| Membre                  | `member`               | `collaborator`, `user` (pour le rôle) |
| Propriétaire            | `owner`                | `admin`                               |
| Éditeur                 | `editor`               | `contributor`, `designer`             |
| Projet                  | `project`              | `designSystem`                        |
| Token                   | `token`                | `variable`, `style`                   |
| Mode                    | `mode`                 | `theme`, `context`                    |
| Modificateur            | `modifier`             | `theme`, `dimension`                  |
| Thème                   | `theme`                | `palette`                             |
| Composant               | `component`            | `widget`, `block`                     |
| Variante                | `variant`              | `state`                               |
| Décision                | `decision`             | `change`                              |
| Proposition             | `proposal`             | `suggestion`, `draft`                 |
| Lot de propositions     | `proposalBatch`        | `batch` (seul), `import`              |
| Intention               | `intent`               | `description`, `message`, `title`     |
| Proposée                | `proposed`             | `draft`, `pending`                    |
| Validée                 | `validated`            | `approved`, `published`               |
| Rejetée                 | `rejected`             | `deleted`, `cancelled`                |
| Remplacée               | `superseded`           | `obsolete`, `replaced`                |
| Historique              | `history`              | `log`, `audit`, `journal`             |
| Membre supprimé         | `deletedMember`        | `anonymous`, `unknown`                |
| Rendu                   | `render`               | `preview`, `screenshot`               |
| Snapshot                | `snapshot`             | `screenshot`, `capture`               |
| Référence de conformité | `conformanceReference` | `reference` (seul)                    |
| Référence de régression | `regressionReference`  | `baseline`, `reference` (seul)        |
| Écart                   | `deviation`            | `diff`                                |
| Verdict                 | `verdict`              | `status`, `result`                    |

Les valeurs du verdict sont `conforming`, `deviation` et `no_reference`. Un snapshot devenu référence de régression est `accepted`, jamais `validated`. Une ligne de la table des membres (ADR 0017) est un `membership` : le membre à une période donnée, avec son rôle.

## Format des ADR

Les ADR suivent le format et le circuit de `.claude/rules/adr-et-spikes.md` (en-tête en liste, numérotation, statut), et non le format par défaut des skills. Pour en rédiger un nouveau ou vérifier qu'un changement respecte les ADR acceptés, passer par l'agent `adr-architecte`. Un ADR accepté ne se réécrit pas : un nouvel ADR le remplace.

## Signaler les conflits avec un ADR

Si une production contredit un ADR existant, le dire explicitement plutôt que de passer outre en silence :

> _Contredit l'ADR 0007 (un seul backend API et MCP), mais mérite d'être rouvert parce que…_
