# Plan : purger l'historique à la limite de stockage

**Issue** : #186
**Décision** : ADR 0042
**Statut** : Actif

## Objectif

Un espace qui atteint sa limite de stockage redescend à 90 % de celle-ci : la plateforme supprime les plus anciennes entrées d'historique de ses projets, en commençant par celui qui consomme le plus, prévient ses propriétaires, et l'historique dit jusqu'où il a été purgé.

## Critères d'acceptation

Ceux de #186, répartis par tranche ci-dessous.

## Tranches

Chaque tranche suit RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR, et fait une PR. Les critères d'une tranche sont validés avant son premier test.

### Tranche 1 : la purge ramène un espace à 90 % de sa limite

**Valeur** : un espace qui atteint sa limite cesse de grossir par son historique.
**Chemin** : `pnpm --filter @repo/api run purge` (connexion `DATABASE_URL_HISTORY_MAINTAINER`) → cas d'usage `purgeHistory` du module history → espaces dont le stockage (somme de `project.stored_bytes`) atteint la limite de leur plan (`storageLimitOf`, exposée par `space/contracts`) → pour chaque espace, projets triés par `stored_bytes` décroissant → lots de 500 entrées, chacun dans sa transaction : `pg_try_advisory_xact_lock` sur l'espace, relecture du stockage et des plus anciennes entrées, suppression, `StorageMeter.remove` avec les lignes supprimées, mise à jour de `history_purged_before` et `history_purged_at` → arrêt à 90 % de la limite, quand plus aucun projet n'a d'entrée, ou au budget de 30 s → le passage renvoie, par espace, les projets purgés, le nombre d'entrées supprimées et la date de la plus récente. Migration : colonnes `history_purged_before` et `history_purged_at` sur `project`, droits de l'ADR 0042 §7. Hors tranche : email, exposition par l'API, Worker et cron.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères** :

1. Un espace sous sa limite n'est pas touché : aucune entrée supprimée, compteurs et trace inchangés.
2. Un espace à sa limite ou au-dessus redescend à 90 % ou moins, et pas plus bas que ce qu'exige le dernier lot.
3. Les entrées supprimées sont les plus anciennes du projet qui consomme le plus (par `occurred_at`, puis `id`) ; quand ce projet n'a plus d'entrée, la purge passe au suivant.
4. Quand plus aucun projet n'a d'entrée, la purge s'arrête, l'espace au-dessus de 90 %, sans erreur.
5. Le compteur de chaque projet baisse exactement de la taille des entrées supprimées (`storedSize`, ADR 0032 §2).
6. Le projet purgé porte `history_purged_before`, la date de la plus récente entrée supprimée, et `history_purged_at`, la date du passage ; un projet non purgé garde les siennes.
7. Un lot ne supprime pas plus de 500 entrées ; un passage s'arrête à son budget et le passage suivant reprend là où il s'est arrêté.
8. Un lot qui n'obtient pas le verrou de l'espace ne supprime rien et le passage saute cet espace ; deux passages simultanés ne suppriment jamais deux fois plus que nécessaire.
9. Le passage renvoie, pour chaque espace purgé, ses projets purgés avec le nombre d'entrées supprimées et la date de la plus récente ; un passage sans suppression ne renvoie rien.
10. Le rôle `history_maintainer` a exactement les droits de l'ADR 0042 §7 ; le rôle `app` ne peut toujours ni modifier ni supprimer une entrée.
11. L'ADR 0019 et sa ligne d'index mentionnent l'extension de son §2 par l'ADR 0042 (ADR 0042, note 6).

Décision prise pendant la tranche : un passage ne reprend qu'un espace encore à sa limite. Un espace qu'un budget coupe entre sa limite et 90 % attend de repasser sa limite.

### Tranche 2 : les propriétaires reçoivent un email après un passage qui supprime

**Valeur** : un propriétaire apprend que l'historique de son espace a été purgé, et lequel.
**Chemin** : résultat du passage (noms de l'espace et des projets compris) → pour chaque espace purgé, relecture du stockage et des propriétaires ouverts → un email en français par propriétaire (ADR 0042 §5) → échec journalisé, sans nouvel essai.
**Compétences à charger** : `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Critères** :

1. Après un passage qui supprime des entrées d'un espace, chaque propriétaire ouvert reçoit un seul email, même après plusieurs lots.
2. Un éditeur, un propriétaire parti (`closed_at`) et un non-membre ne reçoivent rien.
3. Un espace non purgé (sous sa limite, verrouillé, sans entrée) ne déclenche aucun email.
4. Le sujet est « L'historique de l'espace « X » a été purgé sur dezyn ». Le texte donne, pour chaque projet purgé, son nom, le nombre d'entrées supprimées (« 1 entrée », « 2 entrées ») et la date de la plus récente (« 10 novembre 2026 », UTC) ; le stockage de l'espace après la purge et sa limite ; en Free, les 20 Go du plan Team.
5. Un échec d'envoi est journalisé (`history_purge_email_unsent`, avec l'espace et le destinataire), sans nouvel essai ; les autres propriétaires reçoivent leur email et la purge n'est pas défaite.
6. `pnpm --filter @repo/api run purge` envoie par le mailer SMTP de l'API (`SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`).

### Tranche 3 : l'API dit jusqu'où l'historique a été purgé

**Valeur** : l'IA et l'interface savent que l'historique d'un projet est incomplet.
**Chemin** : `GET /v1/projects/{id}/history` et `read_history` renvoient `purgedBefore` ; le projet renvoie `historyPurgedAt`.
**Critères** : à valider avant la tranche.

### Tranche 4 : le Worker `dezyn-purge` purge la production toutes les 15 minutes

**Valeur** : la purge tourne sans intervention.
**Chemin** : configuration Wrangler à part, Cron Trigger `*/15 * * * *`, Hyperdrive sur `history_maintainer`, déclenchement manuel dans le runbook d'hébergement. Attend #161.
**Critères** : à valider avant la tranche. La dernière PR supprime ce plan et clôt #186.
