# Plan : des rôles de production hors de neon_superuser

**Branche** : fix/roles-production
**Statut** : Actif
**Issue** : #145

## But

En production, `app` ne peut plus ni modifier ni supprimer une ligne de `history_entry`. Pour cela, `migrator`, `app` et `history_maintainer` sont remplacés par des rôles créés en SQL, sous les mêmes noms, sans perte de données. Une coupure de l'API de quelques secondes est acceptée.

## Faits établis

- En production, les trois rôles sont membres de `neon_superuser`, et `has_table_privilege('app', 'history_entry', 'UPDATE')` répond `true`.
- `REVOKE neon_superuser` est refusé, même en `neondb_owner`. Seule la suppression du rôle par l'API de Neon le retire.
- Un rôle créé en SQL par `neondb_owner` n'est pas membre de `neon_superuser`. Vérifié sur `preview`.
- Les noms sont figés : les migrations accordent leurs droits à `migrator`, `app` et `history_maintainer` par leur nom.
- `migrator` possède toutes les tables. Seul `deploy.yml` s'en sert, par le secret GitHub `DATABASE_URL_MIGRATOR`.
- `app` sert l'API par Hyperdrive (`ed807e2d…`). `wrangler hyperdrive update --origin-user --origin-password` change le rôle sans redéployer.
- `history_maintainer` n'est utilisé par aucun code en production.
- La production est en service (`DEPLOY_ENABLED=true`, `/health` répond 200), avec des données de test seulement.

## Ce qui reste inconnu, et que la répétition doit trancher

1. Que fait l'API de Neon des objets d'un rôle qu'elle supprime : refus, `REASSIGN OWNED` au propriétaire de la base, ou `DROP OWNED` ? Dans le dernier cas, supprimer `migrator` tant qu'il possède les tables les détruirait. Le plan ne dépend d'aucune de ces réponses, puisqu'il retire toute propriété à `migrator` avant la suppression. La répétition doit le confirmer.
2. Supprimer un rôle par l'API redémarre-t-il le compute, et combien de temps l'API reste-t-elle coupée ?
3. Hyperdrive prend-il le nouveau mot de passe tout de suite, ou garde-t-il un temps ses connexions ?

## La procédure

Chaque rôle passe par un **dépositaire** : un rôle SQL temporaire, sans connexion, qui garde ses droits pendant que Neon supprime l'original et qu'il est recréé en SQL. Le dépositaire de `migrator` garde aussi ses objets.

1. **Couper les déploiements** : `DEPLOY_ENABLED=false`. Aucune migration ne tourne pendant l'opération.
2. **`migrator`**
   1. Créer `migrator_keeper` en SQL et l'accorder à `migrator`. Connecté en `migrator` : `REASSIGN OWNED BY migrator TO migrator_keeper`, puis copier les droits explicites de `migrator` sur `migrator_keeper`.
   2. Supprimer `migrator` par `neonctl`. Il ne possède plus rien.
   3. Créer `migrator` en SQL et l'accorder à `migrator_keeper`. Connecté en `migrator_keeper` : `REASSIGN OWNED BY migrator_keeper TO migrator`, puis recopier les droits.
   4. Supprimer `migrator_keeper`, puis mettre à jour le secret `DATABASE_URL_MIGRATOR`.
3. **`app`**
   1. Créer `app_keeper` en SQL et lui copier tous les droits explicites de `app` : base, schémas, tables, colonnes, séquences. L'absence d'UPDATE sur `history_entry` est conservée.
   2. Supprimer `app` par `neonctl`. L'API répond 503 à partir d'ici.
   3. Créer `app` en SQL, lui recopier les droits de `app_keeper`, puis faire pointer Hyperdrive sur le nouveau mot de passe. L'API répond de nouveau.
   4. Supprimer `app_keeper`.
4. **`history_maintainer`** : comme `app`, sans Hyperdrive.
5. **Vérifier**
   - aucun des trois rôles n'est privilégié (`provisionRoles` connaît déjà le critère) ;
   - `has_table_privilege('app', 'history_entry', 'UPDATE')` répond `false`, et `INSERT` répond `true` ;
   - `migrator` possède toutes les tables de `public` et le schéma `drizzle` ;
   - le nombre de lignes de chaque table est le même qu'avant.
6. **Remettre `DEPLOY_ENABLED=true`**, puis vérifier qu'un déploiement migre bien avec le nouveau `migrator`.

Les mots de passe sont tirés par `openssl` dans le script. Ils ne sont jamais affichés, et ne passent que par `wrangler hyperdrive update` et `gh secret set`.

## Critères d'acceptation

- [ ] Aucun des trois rôles de production n'est superutilisateur, `BYPASSRLS`, `CREATEROLE`, ni membre de `pg_write_all_data` ou de `neon_superuser`.
- [ ] En production, `app` ne peut ni modifier ni supprimer une ligne de `history_entry`, et peut toujours en insérer.
- [ ] Toutes les données sont intactes : le nombre de lignes de chaque table est le même avant et après.
- [ ] `/health` ne répond pas 200 que pendant le remplacement de `app`, quelques secondes.
- [ ] Un déploiement après l'opération migre avec le nouveau `migrator`.
- [ ] Toute la procédure est d'abord répétée sur une branche Neon copiée de `main`, avec ses données.

## Tranches

Chaque tranche suit RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR, et attend l'accord avant chaque commit.

### Tranche 1 : copier les droits explicites d'un rôle sur un autre

**Valeur** : débloque la tranche 2. Un dépositaire reçoit exactement les droits du rôle qu'il garde, sans appartenance héritée.
**Chemin** : `copyRolePrivileges({connectionString, from, to})` dans `packages/db`. Il lit les ACL de `pg_database`, `pg_namespace`, `pg_class` (tables et séquences) et `pg_attribute` (colonnes), puis rejoue chaque droit par `GRANT` vers `to`.
**Critères** :

- après copie, `to` a sur chaque table, colonne, séquence, schéma et sur la base les mêmes droits que `from` ;
- un droit que `from` n'a pas, comme UPDATE sur `history_entry` après `0005_history.sql`, n'est pas donné à `to` ;
- l'appartenance de `from` à d'autres rôles n'est pas copiée ;
- la copie est atomique.
  **RED** : test d'intégration sur une base jetable migrée. On compare `has_table_privilege` et `has_column_privilege` de `app` et de la copie, sur toutes les tables et colonnes de `public` et de `drizzle`. Le cas `history_entry` est nommé dans le test.
  **Mutants à surveiller** : les filtres par type d'objet (`relkind`), l'oubli des colonnes, le `BEGIN`.

### Tranche 2 : une commande `prod:roles` qui remplace les rôles d'une branche Neon, d'abord répétée sur une copie

**Valeur** : l'opérateur remplace les rôles en une commande, avec les vérifications de l'étape 5, et peut la répéter sur une copie avant la production.
**Chemin** : `scripts/env/roles-replace.sh <branche>`. Il suit la procédure ci-dessus. Sur une branche autre que `main`, il saute Hyperdrive et le secret GitHub. Il demande une confirmation avant chaque suppression, et s'arrête à la première vérification en échec. Pour le critère de privilège, il réutilise `provisionRoles`, ou une fonction `privilegedRoles` à extraire de ce module.
**Critères** :

- sur une branche `rehearsal-roles` copiée de `main`, la commande aboutit, et les vérifications de l'étape 5 passent ;
- le nombre de lignes de chaque table est le même avant et après ;
- relancée, la commande ne refait rien : les rôles sont déjà SQL.
  **RED** : la partie testable est en TypeScript (comptage des lignes, vérifications) et a ses tests d'intégration. Le script shell se valide par la répétition, dont le compte rendu va dans la PR.
  **Livré dans la PR** : les réponses aux trois inconnues.

### Tranche 3 : l'exécution en production

Pas de code. C'est une opération, faite par l'utilisateur dans un vrai terminal, avec la commande de la tranche 2 :

- avant : `DEPLOY_ENABLED=false`, et une sonde `/health` toutes les secondes, pour mesurer la coupure ;
- après : les vérifications, puis `DEPLOY_ENABLED=true`, et un déploiement observé.

Elle ferme #145.

### Tranche 4 : un ADR et la doc

- un ADR, au statut Proposé : les rôles PostgreSQL de dezyn sont créés en SQL, jamais par la console ou l'API de Neon ;
- dans RELIABILITY, la description des rôles de production.

Cette tranche peut partir avec la tranche 2.

---

_Supprimer ce fichier quand le plan est terminé. Si `plans/` est vide, supprimer le dossier._
