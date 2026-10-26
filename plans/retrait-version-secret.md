# Plan : retirer une ancienne version du secret d'authentification

**Issue** : #156
**Statut** : à valider

## But

L'opérateur sait quelles versions du secret le Worker `dezyn-api` doit garder, retire les autres sans casser l'émission des jetons, et termine une rotation sans attendre l'expiration de l'ancienne clé.

## Ce que fait better-auth 1.7.7

- La signature utilise la clé valide la plus récente de `identity_jwks`, c'est-à-dire la plus récente dont `expires_at` est vide ou dans le futur. Seule cette clé est déchiffrée (`plugins/jwt/sign.mjs`, `adapter.mjs`). S'il n'y en a aucune, better-auth en crée une, chiffrée par la version courante.
- Chaque clé expire 90 jours après sa création (`rotationInterval`). Une clé expirée reste publiée dans le JWKS pendant un jour (`gracePeriod`), pour vérifier les jetons qu'elle a signés. Sa partie privée ne sert plus.
- `private_key` contient une chaîne JSON. Une clé chiffrée par `BETTER_AUTH_SECRET_<N>` commence par `"$ba$<N>$`. Une clé sans enveloppe vient de `BETTER_AUTH_SECRET`.
- `oauth-provider` chiffre aussi la fenêtre de rejeu des refresh tokens, qui dure 30 s (`refreshTokenReuseInterval`). Les cookies sont signés avec le secret courant seulement.

**Règle :** une version `N` est nécessaire tant qu'une clé valide commence par `"$ba$<N>$`. La version la plus haute est toujours nécessaire, puisqu'elle chiffre les prochaines clés. `BETTER_AUTH_SECRET` reste obligatoire.

## Tranches

Chaque tranche suit RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR. Avant tout code, charger `tdd`, `testing`, `mutation-testing` et `refactoring`. Les critères d'une tranche sont validés avant le premier test.

### Tranche 1 : `pnpm prod:check` dit quelles versions garder et lesquelles retirer

**Valeur** : l'opérateur retire une version sans risque, et voit tout de suite qu'une version dont dépend une clé a disparu.
**Chemin** : `prod-check.sh` → `packages/db/scripts/secret-versions.ts`, avec l'URL de `migrator` → lecture des clés valides de `identity_jwks` → comparaison avec `wrangler secret list` → lignes `OK`/`ÉCHEC` et `info`.

**Critères d'acceptation**

- [ ] `secretVersionsInUse({ connectionString, now })` renvoie les versions des clés valides : `legacy` pour une clé sans enveloppe, `N` pour `"$ba$<N>$`. Une clé dont `expires_at` est passé ne compte pas ; une clé sans `expires_at` compte. Test d'intégration sur une base jetable, avec des lignes insérées.
- [ ] Le script affiche une version par ligne.
- [ ] `prod:check` échoue si le Worker n'a pas un secret dont une clé valide dépend, que ce soit `BETTER_AUTH_SECRET_<N>` ou `BETTER_AUTH_SECRET` pour `legacy`.
- [ ] `prod:check` liste, en `info`, les versions `BETTER_AUTH_SECRET_<N>` qu'on peut retirer : celles que le Worker a, dont aucune clé valide ne dépend, et qui ne sont pas la plus haute.
- [ ] Le choix des versions à retirer est une fonction de `lib.sh`, couverte par `scripts/env/tests/lib.test.sh` : entrée = secrets du Worker et versions utilisées, sortie = versions à retirer.
- [ ] `docs/runbooks/hebergement.md` décrit le retrait : lancer `prod:check`, puis `wrangler secret delete BETTER_AUTH_SECRET_<N>` pour chaque version listée.

### Tranche 2 : une rotation termine aussitôt, en expirant les clés valides

**Valeur** : après `prod:secrets`, l'ancienne version est retirable sans attendre 90 jours.
**Chemin** : `prod-secrets.sh`, après la pose de `BETTER_AUTH_SECRET_<N+1>` → `packages/db/scripts/expire-signing-keys.ts`, avec l'URL de `migrator` → `expires_at = now()` sur les clés valides → appel de `/health`, qui crée une clé chiffrée par `N+1`.

**Critères d'acceptation**

- [ ] `expireSigningKeys({ connectionString, now })` passe `expires_at` à `now` sur les clés valides, sans toucher aux clés déjà expirées, et renvoie le nombre de clés expirées. Test d'intégration.
- [ ] Test d'intégration de bout en bout sur l'API : une clé est chiffrée par la version 2. On redémarre avec la version 3, on expire les clés, puis on appelle `/health`. Résultat : `/health` répond 200, et une API qui n'a plus la version 2 émet encore des jetons.
- [ ] Un jeton d'accès signé par l'ancienne clé reste accepté par l'API après l'expiration de cette clé, grâce au `gracePeriod`.
- [ ] `prod:secrets` n'expire les clés qu'après avoir posé la nouvelle version, puis appelle `/health` et signale s'il ne répond pas 200.
- [ ] Le guide et RELIABILITY disent qu'après `prod:secrets`, `prod:check` liste l'ancienne version comme retirable.

## Avant chaque PR

- Stryker sur les fichiers TypeScript changés, et mutants manuels sur les fonctions shell. Le rapport va dans la PR.
- Évaluer un refactoring.
- `tsc`, oxlint, oxfmt et `pnpm test:scripts` passent.
- `Refs #156` sur la première PR, `Closes #156` sur la dernière.

---

_Supprimer ce fichier une fois le plan livré._
