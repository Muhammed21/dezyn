# dezyn

Plateforme centrale de design pensée pour l'IA : l'IA du client y lit et y écrit via MCP, l'humain la consulte et la valide (ADR 0001, ADR 0002).

## Documentation

Décisions, spikes et où écrire : [`docs/README.md`](docs/README.md). Chaque page en une ligne : [`docs/CATALOG.md`](docs/CATALOG.md).

## Dépôt

Monorepo pnpm et Turborepo, en TypeScript 7.

| Chemin                       | Contenu                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `apps/`                      | Les applications, qui arrivent avec leur premier use-case      |
| `packages/docs-catalog`      | Générateur de `docs/CATALOG.md`                                |
| `packages/typescript-config` | Configuration TypeScript partagée                              |
| `packages/ui`                | Composants React partagés                                      |
| `docker/`, `compose.yaml`    | Environnement local : PostgreSQL, stockage S3, Mailpit         |
| `.github/`                   | CI, revue Claude par palier (`REVIEW.md`), release, benchmarks |

## Commandes

Node est épinglé dans `.node-version`.

```sh
pnpm install
cp .env.example .env
pnpm infra:up       # services locaux
pnpm test:infra     # tests de l'infrastructure locale
pnpm migrate        # migrations sur la base locale
pnpm seed           # utilisateur, espace d'équipe et projet de dev (--name, --email, --password)
pnpm db:reset       # supprime les utilisateurs et tout ce qui leur est lié, garde les clients OAuth ; base locale seulement
pnpm studio         # Drizzle Studio sur la base locale, rôle migrator
pnpm lint           # oxlint typé
pnpm fmt            # oxfmt
pnpm check-types
pnpm test
pnpm generate       # artefacts générés : catalogue de la documentation
```

Quand `BETTER_AUTH_SECRET` change dans `.env`, la clé de signature de la base locale ne se déchiffre plus et `/health` répond 503. Vider la clé ; better-auth en crée une avec le nouveau secret :

```sh
docker compose exec -e PGPASSWORD=dev_migrator postgres psql -h 127.0.0.1 -U migrator -d dezyn -c 'DELETE FROM identity_jwks'
```

Les hooks git (husky) lancent secretlint, oxfmt et oxlint au commit, commitlint sur le message, puis le lint, le typage et les tests des paquets touchés au push.
