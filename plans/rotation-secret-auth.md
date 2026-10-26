# Plan : changer le secret d'authentification sans casser l'émission des jetons

**Issue** : #127
**Branche** : `fix/rotation-secret-auth`, une branche par tranche
**Statut** : à valider

## But

L'opérateur change le secret d'authentification de production sans que `/auth/oauth2/token` réponde 500. Une clé de signature indéchiffrable fait échouer `/health`, ce qui bloque le déploiement.

## Décisions

- **Secrets versionnés.** better-auth 1.7.7 accepte `secrets: [{ version, value }]`. Le premier secret de la liste chiffre, au format `$ba$<version>$…`. Pour déchiffrer, better-auth choisit le secret d'après la version écrite dans la donnée. Une donnée sans version se déchiffre avec `secret`, que l'API remplit avec `BETTER_AUTH_SECRET`.
- **Un secret Cloudflare par version.** L'API lit `BETTER_AUTH_SECRET_<N>`, et la version la plus haute chiffre. Cloudflare ne rend jamais la valeur d'un secret, mais il en liste les noms. Le script peut donc ajouter une version sans connaître les anciennes. `BETTER_AUTH_SECRET` reste obligatoire et déchiffre les données sans version, comme la clé actuelle de production.
- **`/health` répond 503** quand la clé de signature courante ne se déchiffre pas. L'API reste démarrée et le reste continue de répondre.
- **En local**, la procédure est documentée sous `pnpm db:reset` : vider `identity_jwks`. Aucun code n'est ajouté pour ce cas.
- **Seule `identity_jwks` dépend du secret.** Comme le plugin JWT est actif, les secrets des clients OAuth sont hachés et non chiffrés. Les refresh tokens sont hachés par `hashToken`, sans secret.

## Conséquences à accepter

- Les cookies de session sont signés avec le secret courant. Après une rotation, les sessions web en cours se ferment et l'utilisateur doit se reconnecter. Les refresh tokens et les jetons d'accès restent valides.
- Une ancienne version ne se supprime que lorsque plus aucune ligne de `identity_jwks` n'en dépend. Le retrait d'une version fera l'objet d'une issue de suivi.

## Préalable en production (hors code)

La clé actuelle de production est peut-être chiffrée avec le secret remplacé le 26/10. Avant de merger la tranche 2, il faut vider `identity_jwks` sur la branche `production`, sinon `deploy.yml` échouera au contrôle de santé. C'est d'ailleurs ce que la tranche 2 doit détecter.

## Tranches

Chaque tranche suit RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR. Avant tout code, charger `tdd`, `testing`, `mutation-testing` et `refactoring`. Les critères d'une tranche sont validés avant le premier test.

### Tranche 1 : une nouvelle version du secret n'empêche plus l'émission des jetons

**Valeur** : l'opérateur ajoute un secret, et les clients MCP continuent d'obtenir des jetons.
**Chemin** : bindings du Worker ou `.env` → `readWorkerConfig` / `readApiConfig` → `createIdentityAuth({ secrets })` → `betterAuth({ secret, secrets })` → `/auth/oauth2/token`.

**Critères d'acceptation**

- [ ] Une API démarrée avec `BETTER_AUTH_SECRET=A` émet un jeton. Redémarrée sur la même base avec `BETTER_AUTH_SECRET=A` et `BETTER_AUTH_SECRET_2=B`, elle émet encore un jeton par `/auth/oauth2/token`. Test d'intégration, sur la vraie base.
- [ ] Après ce redémarrage, une clé de signature nouvellement créée ne se déchiffre plus avec `A` seul : une API démarrée avec `BETTER_AUTH_SECRET=A` uniquement répond 500 sur `/auth/oauth2/token`. Cela prouve que la version 2 chiffre.
- [ ] Avec `BETTER_AUTH_SECRET_2` et `BETTER_AUTH_SECRET_10`, c'est la version 10 qui chiffre : le tri est numérique, pas alphabétique.
- [ ] La config refuse un `BETTER_AUTH_SECRET_<N>` de moins de 32 caractères, avec le message « BETTER_AUTH_SECRET_<N> : 32 caractères au moins ». Elle refuse aussi un suffixe qui n'est pas un entier positif (`BETTER_AUTH_SECRET_X`, `BETTER_AUTH_SECRET_0`), avec un message qui nomme la variable.
- [ ] Sans aucune variable `BETTER_AUTH_SECRET_<N>`, le comportement ne change pas, et les tests existants passent sans modification.

**RED** : le test d'intégration à deux démarrages, puis les cas de config dans `api-config.test.ts`. Les mutants à surveiller : le tri inversé, le tri alphabétique, `>=` à la place de `>` sur la longueur, et l'oubli du secret historique.
**GREEN** : un champ `authSecrets` dans les deux configs, transmis à `betterAuth`.

### Tranche 2 : `/health` répond 503 quand la clé de signature ne se déchiffre pas

**Valeur** : un secret qui ne correspond pas à la clé bloque le déploiement au lieu de casser les jetons sans bruit.
**Chemin** : `GET /health` → ping de la base, puis signature d'un jeton de test par la clé courante → 200 ou 503, avec un log.

**Critères d'acceptation**

- [ ] Sur une base dont la clé a été chiffrée avec un autre secret, `/health` répond 503 avec le problème « Service indisponible ». Le log écrit `signing key undecryptable`, sans la clé ni le secret.
- [ ] Sur une base sans clé, `/health` répond 200.
- [ ] Sur une base dont la clé se déchiffre, `/health` répond 200.
- [ ] Une base injoignable donne toujours 503, comme aujourd'hui.

`/health` signe un jeton de test : sur une base vide, cela crée la première clé, ce qui est accepté.

### Tranche 3 : `pnpm prod:secrets` ajoute une version au lieu de remplacer, et les guides le disent

**Valeur** : l'opérateur change le secret en une commande, sans SQL et sans coupure.
**Chemin** : `prod-secrets.sh` liste les secrets du Worker, calcule `N+1` et pose `BETTER_AUTH_SECRET_<N+1>` par `openssl`. `BETTER_AUTH_SECRET` n'est posé que s'il manque.

**Critères d'acceptation**

- [ ] Sur un Worker sans secret, `prod:secrets` pose `BETTER_AUTH_SECRET`.
- [ ] Sur un Worker qui a `BETTER_AUTH_SECRET` et `BETTER_AUTH_SECRET_2`, accepter la rotation pose `BETTER_AUTH_SECRET_3`, sans toucher aux deux autres. L'invite signale que les sessions web en cours se ferment.
- [ ] `prod:check` vérifie que `/health` répond 200, ce qui couvre maintenant la clé.
- [ ] Le guide `docs/runbooks/hebergement.md` remplace « Changer `BETTER_AUTH_SECRET` » par la rotation, et le `DELETE` disparaît de la procédure de production. RELIABILITY suit le même changement.
- [ ] Sous `pnpm db:reset`, le README dit comment vider `identity_jwks` en local quand le secret de `.env` a changé.

Le calcul de `N+1` se teste sur une liste de noms. Le reste du script est vérifié par une exécution sur un Worker de test, faute de harnais shell.

## Avant chaque PR

- Stryker sur les fichiers changés, et le rapport dans la PR.
- Évaluer un refactoring.
- `tsc`, oxlint et oxfmt passent.
- Corps de PR : Summary / Evidence / Merge Danger, avec `Closes #127` sur la dernière tranche et `Refs #127` sur les autres.

---

_Supprimer ce fichier une fois le plan livré._
