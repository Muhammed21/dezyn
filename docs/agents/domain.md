# Documentation du domaine

**Type:** reference

Comment les skills d'ingénierie lisent la documentation du domaine de ce dépôt quand ils explorent le code.

## Avant d'explorer, lire

- **`CONTEXT.md`** à la racine du dépôt.
- **`docs/adr/`** : les ADR qui touchent la zone sur laquelle on s'apprête à travailler. L'index et les statuts sont dans `docs/adr/README.md`.

Si l'un de ces fichiers n'existe pas, **continuer sans rien dire**. Ne pas signaler son absence, ne pas proposer de le créer d'avance. Le skill `/domain-modeling` (atteint via `/grill-with-docs` et `/improve-codebase-architecture`) les crée au fil de l'eau, quand un terme ou une décision est réellement tranché.

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

## Format des ADR

Les ADR suivent le format et le circuit de `.claude/rules/adr-et-spikes.md` (en-tête en liste, numérotation, statut), et non le format par défaut des skills. Pour en rédiger un nouveau ou vérifier qu'un changement respecte les ADR acceptés, passer par l'agent `adr-architecte`. Un ADR accepté ne se réécrit pas : un nouvel ADR le remplace.

## Signaler les conflits avec un ADR

Si une production contredit un ADR existant, le dire explicitement plutôt que de passer outre en silence :

> _Contredit l'ADR 0007 (un seul backend API et MCP), mais mérite d'être rouvert parce que…_
