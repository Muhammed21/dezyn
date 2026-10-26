# Recréer et vérifier l'hébergement

**Type:** how-to

L'API tourne dans le Worker Cloudflare `dezyn-api`, sur `api.dezyn.dev`, et joint la branche Neon `production` par Hyperdrive (ADR 0034). Chaque PR a sa preview, sur le Worker `dezyn-api-preview` et sa propre branche Neon. Le déploiement, le rollback et les rôles PostgreSQL : voir [RELIABILITY](../RELIABILITY.md#deploy-vs-release).

Les étapes suivent l'ordre des dépendances. Les commandes `pnpm` se lancent depuis la racine du dépôt, dans un vrai terminal : elles demandent des confirmations et des valeurs masquées, et n'affichent ni secret ni URL de connexion. Chaque commande est relançable : sur une ressource déjà en place, elle ne change rien sans confirmation.

## 1. Prérequis

- Un compte Cloudflare, un compte Neon, un compte Resend, et les droits d'administration du dépôt GitHub.
- Les CLI connectées :

  ```
  gh auth login
  npx neonctl@2.47.0 auth
  (cd apps/api && npx wrangler login)
  ```

## 2. Cloudflare : la zone et les jetons

1. **La zone `dezyn.dev`** doit être active dans le compte. Sans elle, `wrangler deploy` échoue avec « Can't infer zone from route », car la route `api.dezyn.dev` de `apps/api/wrangler.jsonc` est un domaine personnalisé de cette zone. Le premier déploiement crée le domaine `api.dezyn.dev` et le Worker `dezyn-api`.
2. **Le sous-domaine `workers.dev`** du compte : il donne les URLs de preview, `https://pr-<N>-dezyn-api-preview.<sous-domaine>.workers.dev`. Le noter pour l'étape 4.
3. **Le jeton de production**, rangé dans le secret GitHub `CLOUDFLARE_API_TOKEN` de l'environnement `production` (étape 4), avec ces permissions :
   - Account : Workers Scripts Edit ;
   - Account : Hyperdrive Read ;
   - Zone `dezyn.dev` : Zone Read et Workers Routes Edit.
4. **Le jeton de preview**, distinct, rangé dans le secret `CLOUDFLARE_API_TOKEN` de l'environnement `preview` : le modèle « Edit Cloudflare Workers ».

Workers Logs est activé par `observability` dans `apps/api/wrangler.jsonc` : il n'y a rien à créer. Les logs d'une URL de preview n'y passent pas.

## 3. Neon : le projet, la base de production et Hyperdrive

1. **Le projet Neon.** Sa branche par défaut s'appelle `production`. Noter l'identifiant du projet pour l'étape 4.
2. **Hyperdrive**, créé sur l'URL directe de la branche `production` (l'hôte sans `-pooler`), sans cache. Tant que le rôle `app` n'existe pas, il pointe sur `neondb_owner` ; l'étape suivante le fait pointer sur `app` :

   ```
   (cd apps/api && npx wrangler hyperdrive create dezyn-prod --caching-disabled --connection-string="$(npx neonctl@2.47.0 connection-string production --project-id <projet>)")
   ```

   Reporter l'identifiant renvoyé dans `hyperdrive[0].id` de `apps/api/wrangler.jsonc` et dans `HYPERDRIVE_ID` de `scripts/env/lib.sh`.

3. **Les rôles et le schéma** :

   ```
   pnpm prod:db
   ```

   La commande crée en SQL les rôles `migrator`, `app` et `history_maintainer` (ADR 0036), migre, et ne seede pas. Sur Neon, la base `neondb` appartient à `neondb_owner`, qui ne peut pas la céder à `migrator` ; la commande donne donc à `migrator` les deux droits que les migrations exigent :

   ```sql
   GRANT CREATE ON DATABASE neondb TO migrator;
   GRANT CREATE ON SCHEMA public TO migrator;
   ```

   Elle pose aussi le secret GitHub `DATABASE_URL_MIGRATOR` et fait pointer Hyperdrive sur `app`. Si la pose échoue, elle affiche comment la refaire.

Ne jamais créer un rôle de dezyn par la console ou l'API de Neon : il serait membre de `neon_superuser`, et `app` pourrait réécrire l'historique (ADR 0019). Pour remplacer un tel rôle : `pnpm roles:replace <branche>` (section 8).

## 4. GitHub : les environnements de déploiement

```
pnpm prod:github
pnpm preview:github
```

| Ressource                              | Où                         | Posée par                                                          |
| -------------------------------------- | -------------------------- | ------------------------------------------------------------------ |
| Environnement `production`             | GitHub, réservé à `main`   | `prod:github`                                                      |
| `DEPLOY_ENABLED`                       | variable de dépôt          | `prod:github`, seulement si elle manque                            |
| `CLOUDFLARE_API_TOKEN` (production)    | environnement `production` | `prod:github`, saisi masqué                                        |
| `DATABASE_URL_MIGRATOR`                | environnement `production` | `prod:db` à la création du rôle, ou `prod:github`                  |
| Environnement `preview`                | GitHub, réservé à `main`   | `preview:github`                                                   |
| `WORKERS_SUBDOMAIN`, `NEON_PROJECT_ID` | variables de `preview`     | `preview:github`                                                   |
| `CLOUDFLARE_API_TOKEN` (preview)       | environnement `preview`    | `preview:github`, saisi masqué                                     |
| `NEON_API_KEY`                         | environnement `preview`    | `preview:github`, saisi masqué ; clé limitée au projet si possible |
| `PREVIEW_BETTER_AUTH_SECRET`           | environnement `preview`    | `preview:github`, tiré par `openssl`                               |
| `CLAUDE_CODE_OAUTH_TOKEN`              | secret de dépôt            | à la main, depuis `claude setup-token` ; lu par la revue des PR    |

`prod:github` reconstruit `DATABASE_URL_MIGRATOR` depuis le rôle `migrator` de la branche `production`, sans changer son mot de passe : Neon rend le mot de passe d'un rôle créé en SQL.

Laisser `DEPLOY_ENABLED` à `false` jusqu'à l'étape 5.

## 5. Le Worker de production et les emails

1. **Le domaine d'envoi chez Resend** (ADR 0035) : ajouter `dezyn.dev` dans Resend, poser dans la zone Cloudflare les enregistrements SPF et DKIM qu'il donne, attendre l'état « Verified », puis créer une clé « Sending access » limitée à `dezyn.dev`.
2. **Les secrets du Worker** :

   ```
   pnpm prod:secrets
   ```

   | Secret               | Posé par                                           |
   | -------------------- | -------------------------------------------------- |
   | `BETTER_AUTH_SECRET` | tiré par `openssl` ; seulement dans Cloudflare     |
   | `RESEND_API_KEY`     | saisi masqué ; sans lui, les emails ne partent pas |

   Chaque secret posé publie aussitôt une nouvelle version du Worker, avec le code déployé.

3. **Le premier déploiement** : passer `DEPLOY_ENABLED` à `true`, puis pousser sur `main`. `deploy.yml` migre, déploie et appelle `/health`.

   ```
   gh variable set DEPLOY_ENABLED --body true
   ```

## 6. La preview

`preview.yml` publie des versions du Worker `dezyn-api-preview`, qui doit donc exister avant le premier run. Le créer une fois, sans secret ni binding de production (ADR 0034) :

```
(cd apps/api && npx wrangler deploy --env preview)
```

Puis la branche Neon `preview` :

```
pnpm preview:db
```

La commande crée la branche Neon `preview` en schéma seul si elle manque, ses rôles, la migre, et seede le compte de démo `dev@dezyn.test` avec le mot de passe saisi. Chaque PR copie ensuite la branche `preview` en `pr-<N>`, et chaque version de preview reçoit `PREVIEW_BETTER_AUTH_SECRET`. `pnpm preview:clean` supprime les branches `pr-<N>` des PR fermées.

**Reconstruire la preview avec le bon secret.** Une branche `pr-<N>` garde dans `identity_jwks` une clé chiffrée avec le secret en place à sa création. Après un changement de `PREVIEW_BETTER_AUTH_SECRET`, supprimer les branches `pr-<N>` ouvertes ; le prochain run de `preview.yml` les recrée depuis `preview`, et la clé avec le nouveau secret :

```
npx neonctl@2.47.0 branches delete pr-<N> --project-id <projet>
```

## 7. Vérifier

```
pnpm prod:check
```

Chaque contrôle doit être `OK` : rôles de la branche `production`, secrets GitHub et `DEPLOY_ENABLED`, secret du Worker, Hyperdrive connecté en `app` au compute de `production`, et `/health`.

## 8. Opérations courantes

### Remplacer des rôles créés par Neon

```
pnpm roles:replace <branche>
```

Sur `production`, passer d'abord `DEPLOY_ENABLED` à `false`, et répéter l'opération sur une copie de la branche. L'API répond 503 quelques secondes pendant le remplacement de `app`.

### Changer `BETTER_AUTH_SECRET`

better-auth chiffre la clé de signature des jetons, dans `identity_jwks`, avec `BETTER_AUTH_SECRET`. Après un changement de secret, il ne sait plus la déchiffrer et `/auth/oauth2/token` répond 500 (#127). Après `pnpm prod:secrets`, supprimer la clé dans le SQL Editor de Neon, sur la branche `production` ; better-auth en crée une avec le nouveau secret :

```sql
DELETE FROM identity_jwks;
```

Les jetons d'accès en cours deviennent invalides ; les refresh tokens n'en dépendent pas.
