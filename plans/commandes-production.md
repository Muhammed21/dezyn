# Plan : monter et vérifier la production par des commandes

**Branche** : feat/commandes-production
**Statut** : Actif
**Issue** : #147

## But

L'opérateur monte la production et vérifie sa cohérence par des commandes, lancées dans un terminal, qui n'affichent ni URL de connexion ni secret, sur le modèle de celles de preview.

## Faits établis

- La production se compose de :
  - l'environnement GitHub `production`, avec les secrets `DATABASE_URL_MIGRATOR` et `CLOUDFLARE_API_TOKEN` ;
  - la variable de dépôt `DEPLOY_ENABLED` ;
  - la branche Neon `production` ;
  - la configuration Hyperdrive `ed807e2d1a7e437f9a17bb749123c6d2`, qui se connecte en `app` ;
  - les secrets du Worker `dezyn-api` : `BETTER_AUTH_SECRET` est requis, et `RESEND_API_KEY` est facultatif, car sans lui le Worker n'envoie pas d'email.
- Les trois rôles de la branche `production` sont créés en SQL (ADR 0036, #145).
- `neonctl connection-string --role-name <rôle>` rend le mot de passe d'un rôle créé en SQL, sans le réinitialiser. Une commande peut donc reconstruire une URL de connexion sans changer de mot de passe.
- `provisionRoles` donne un nouveau mot de passe à un rôle existant. Il convient à la preview, dont les mots de passe changent à chaque run, mais pas à la production.
- `inspectRoles` et `pnpm roles:replace` existent.

## Décisions

- **Un rôle de production existant garde son mot de passe.** `prod:db` crée seulement les rôles manquants. Changer un mot de passe sera une commande à part, si le besoin vient.
- **`prod:check` se lance à la main**, jamais en CI.
- **Aucune commande ne seede la production.**

## Critères d'acceptation

- [x] `pnpm prod:check` passe sur la production actuelle, et échoue en nommant l'écart quand un rôle est privilégié ou qu'un secret manque.
- [ ] `pnpm prod:github`, `pnpm prod:secrets` et `pnpm prod:db` sont relançables : relancés sur une production complète, ils ne changent rien sans confirmation.
- [ ] Sur une branche Neon sans rôles de dezyn, `prod:db` crée les rôles en SQL et migre, sans seed, et `inspectRoles` passe.
- [ ] Aucune commande n'affiche de secret ni d'URL de connexion.
- [ ] RELIABILITY décrit les commandes.

## Tranches

Chaque tranche suit RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR, et attend l'accord avant chaque commit. Le code shell se valide en le lançant ; ce qu'il a de testable passe en TypeScript, avec des tests d'intégration.

### Tranche 1 : `pnpm prod:check`, l'état de la production en lecture seule

**Valeur** : l'opérateur voit d'un coup si la production est cohérente. C'est ce qui aurait révélé #145.
**Chemin** : `scripts/env/prod-check.sh [branche]`, avec `production` par défaut. Une ligne `OK` ou `ÉCHEC` par contrôle, puis le code 1 si l'un d'eux échoue. Le helper `check` de `roles-replace.sh` passe dans `lib.sh`. Les contrôles :

- **base** : `inspectRoles`, connecté en `migrator` par `neonctl connection-string`. Aucun rôle privilégié, tout appartient à `migrator`, et `app` n'a que `INSERT` sur `history_entry` ;
- **GitHub** : l'environnement `production` existe et a `DATABASE_URL_MIGRATOR` et `CLOUDFLARE_API_TOKEN` ; `DEPLOY_ENABLED` vaut `true` ou `false` ;
- **Worker** : `wrangler secret list` contient `BETTER_AUTH_SECRET`. L'absence de `RESEND_API_KEY` s'affiche comme une information (« emails journalisés »), pas comme un échec ;
- **Hyperdrive** : `wrangler hyperdrive get` donne `app` comme utilisateur, et l'hôte du compute de la branche ;
- **API** : `GET https://api.dezyn.dev/health` répond 200.

**Critères** :

- sur la production actuelle, tous les contrôles sont `OK` ;
- sur une copie de `production` dont `app` a été supprimé puis recréé par `neonctl roles create`, donc privilégié, le contrôle de la base échoue et nomme `app`. Les contrôles hors base portent sur la production et restent `OK` ;
- la commande n'écrit rien : ni dans Neon, ni dans GitHub, ni dans Cloudflare ;
- aucune URL de connexion ni aucun secret dans la sortie.

**RED** : aucune logique TypeScript nouvelle, puisque `inspectRoles` est déjà couvert. La validation se fait par les deux lancements ci-dessus, rendus en compte dans la PR.
**Avec la tranche** : la suppression de `plans/roles-production.md`, et RELIABILITY.

### Tranche 2 : `pnpm prod:github`, l'environnement GitHub de production

**Valeur** : l'environnement de déploiement se remonte en une commande, avec ses secrets, sans qu'aucun ne passe par l'écran.
**Chemin** : `scripts/env/prod-github.sh`, sur le modèle de `preview-github.sh` :

- l'environnement `production`, réservé à `main` ;
- `DEPLOY_ENABLED` : demandé seulement s'il manque, et jamais changé autrement ;
- `CLOUDFLARE_API_TOKEN` : saisi masqué par `gh secret set`, et remplacé seulement sur confirmation ;
- `DATABASE_URL_MIGRATOR` : reconstruit depuis `neonctl connection-string --role-name migrator`, sans changer le mot de passe. Il est remplacé seulement sur confirmation, et passe de `neonctl` à `gh secret set` par un tube, sans variable affichée.

**Critères** :

- relancée sur la production actuelle, en répondant non partout, la commande ne change rien : `prod:check` reste `OK`, et les dates de mise à jour des secrets n'ont pas bougé ;
- après le remplacement confirmé de `DATABASE_URL_MIGRATOR`, un déploiement migre. On le vérifie au prochain merge ;
- aucun secret dans la sortie.

**RED** : rien de testable en TypeScript. La validation se fait par le lancement, rendu en compte dans la PR.

### Tranche 3 : `pnpm prod:secrets`, les secrets du Worker

**Valeur** : les secrets du Worker se posent sans copier-coller de valeur.
**Chemin** : `scripts/env/prod-secrets.sh` :

- `BETTER_AUTH_SECRET` : tiré par `openssl` et passé par un tube à `wrangler secret put`. S'il existe déjà, il est remplacé seulement sur confirmation, avec l'avertissement qu'un remplacement déconnecte toutes les sessions ;
- `RESEND_API_KEY` : saisi masqué par `wrangler secret put`, et facultatif. On peut le sauter.

**Critères** :

- relancée sur la production actuelle, en répondant non partout, la commande ne change rien ;
- après coup, `prod:check` est `OK` ;
- aucun secret dans la sortie.

**RED** : rien de testable en TypeScript. La validation se fait par le lancement, rendu en compte dans la PR.

### Tranche 4 : `pnpm prod:db`, les rôles et la migration de la branche de production

**Valeur** : une branche de production se remonte depuis zéro, rôles créés en SQL et schéma migré, sans seed et sans toucher aux mots de passe existants.
**Chemin** :

- `createMissingRoles({connectionString, roles})` dans `packages/db` :
  - il refuse un rôle privilégié, avec le critère de `privilegedRoles` ;
  - il crée les rôles manquants en SQL, avec leur mot de passe, et laisse intacts ceux qui existent ;
  - il renvoie la liste des rôles créés.

  `provisionRoles` reste tel quel pour la preview.

- `scripts/env/prod-db.sh [branche]`, avec `production` par défaut :
  1. il crée les rôles manquants ;
  2. si des rôles sont privilégiés, il s'arrête et renvoie vers `pnpm roles:replace` ;
  3. il migre en `migrator`, avec l'URL de `neonctl` ;
  4. sur `production`, si `migrator` vient d'être créé, il pose `DATABASE_URL_MIGRATOR`, et si `app` vient d'être créé, il fait pointer Hyperdrive sur lui.

**Critères** :

- `createMissingRoles` crée un rôle manquant, qui se connecte avec son mot de passe, sans privilège ;
- `createMissingRoles` laisse intact le mot de passe d'un rôle existant : l'ancien fonctionne toujours ;
- `createMissingRoles` refuse un rôle privilégié sans rien créer, et la création est atomique ;
- relancée sur la production actuelle, la commande ne crée rien, migre (rien à appliquer), et `prod:check` reste `OK` ;
- sur une branche Neon sans les rôles de dezyn, la commande crée les trois rôles et migre, et `inspectRoles` passe. Hyperdrive et le secret ne sont pas touchés hors de `production`.

**RED** : des tests d'intégration de `createMissingRoles`, sur un propriétaire jetable qui a seulement `CREATEROLE`, comme ceux de `provisionRoles`.
**Mutants à surveiller** : le filtre des rôles existants, le refus des rôles privilégiés avant toute création, le `BEGIN`.

## Ordre

Tranche 1 d'abord : elle sert de contrôle aux trois autres. Les tranches 2, 3 et 4 sont indépendantes.

---

_Supprimer ce fichier quand le plan est terminé. Si `plans/` est vide, supprimer le dossier._
