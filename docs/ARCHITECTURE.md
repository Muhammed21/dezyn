# Architecture

## System Context

Une seule app Hono sert l'API HTTP, le MCP en Streamable HTTP et le serveur OAuth des apps d'IA (ADR 0007, 0008). En production, elle tourne dans le Worker Cloudflare `dezyn-api` et joint PostgreSQL par Hyperdrive (ADR 0034) ; en local et dans les tests, sur Node. Dépendances sortantes : PostgreSQL, S3, et pour les emails Resend en production (ADR 0035), SMTP en local. Le Worker de preview `dezyn-api-preview` joint sa branche Neon en direct par `DATABASE_URL`, sans Hyperdrive, et journalise l'email sans l'envoyer (`EMAIL_DELIVERY=log`). Charge : voir [PERFORMANCE.md](PERFORMANCE.md#load-reality).

## Layer Map & Dependency Rule

Modules et couches : ADR 0020 ; contenu des couches : ADR 0022. Les règles oxlint `dezyn/layer-dependencies`, `dezyn/module-boundaries` et `dezyn/pure-domain` vérifient les imports ; une règle métier écrite dans un adaptateur ou une dépendance mutuelle entre modules leur échappe.

| Écart                                                                                                  | Emplacement                                                                                               | Correction                                                                 | Statut |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------ |
| Le rôle donné à l'invité qui accepte (`editor`) est décidé par l'adaptateur Postgres, en deux endroits | `space/infrastructure/postgres-invitation-acceptance.ts:80, 87`                                           | le domaine fixe le rôle, et `NewMember` le porte jusqu'à l'adaptateur      | done   |
| `history` et `project` dépendent l'un de l'autre, par des types de `contracts/`                        | `history/application/read-history.ts`, `record-project-call.ts` ; `project/application/create-project.ts` | la politique d'accès vit dans `space` ; `history` n'importe plus `project` | done   |

## Bounded Contexts & Context Map

Un module par partie du domaine : identity, space, project, token, proposal, history (ADR 0020). Dépendances entre modules, toutes par `contracts/` :

- proposal → token, space, history
- token → space, history
- project → space, history
- history → space

## Domain Glossary (Ubiquitous Language)

Voir [CONTEXT.md](../CONTEXT.md).

## Data & Storage Decisions

PostgreSQL et Drizzle, migrations hors démarrage (ADR 0009) ; historique en ajout seul (ADR 0019) ; références de token gardées par clé étrangère (ADR 0029).

## Decision Log

Voir [docs/adr/](adr/README.md).
