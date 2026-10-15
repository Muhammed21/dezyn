# 0022 — Architecture hexagonale à cœur fonctionnel pour le backend

- Statut : Accepté
- Date : 2026-10-15
- Décideurs : Muhammed

## Contexte et problématique

Le backend est une seule application Hono qui sert l'API HTTP, le MCP et le serveur OAuth (ADR 0007, 0008). L'ADR 0020 découpe l'API en modules et en cinq couches vérifiées par oxlint, sans dire ce que contient chaque couche ni comment un use-case reçoit ses dépendances, tient sa transaction, autorise l'acteur et écrit l'historique.

Le domaine a de vraies règles : propositions et lots (ADR 0012, 0013), conformité contre la version validée (ADR 0014), membres et invariants de l'espace (ADR 0011, 0017), historique en ajout seul (ADR 0004, 0019, 0021). Le dépôt suit un style fonctionnel, sans classes ni décorateurs (ADR 0008).

Spécification détaillée : ticket [#2](https://github.com/Muhammed21/dezyn/issues/2).

Problématique : quelle architecture le backend suit-il à l'intérieur des modules et des couches de l'ADR 0020 ?

## Facteurs de décision

- Les invariants du domaine vérifiés en un seul endroit, testables sans base ni serveur.
- Un use-case appelé à l'identique par une route HTTP et par un outil MCP (ADR 0007 §3).
- L'autorisation et l'auteur de l'historique venant d'une seule source.
- Une donnée jamais écrite sans son entrée d'historique (ADR 0004).
- Le style fonctionnel du dépôt.
- Des adaptateurs remplaçables, MCP compris (ADR 0007, risques).

## Options envisagées

### Option A — Hexagonale (ports et adaptateurs) à cœur fonctionnel

- Avantage : domaine pur, ports déclarés par les use-cases, adaptateurs interchangeables.
- Avantage : correspond aux couches déjà imposées par l'ADR 0020.
- Inconvénient : des ports et des types à écrire, même pour un use-case simple.
- **Retenue.**

### Option B — Clean Architecture à la lettre (interactors, presenters, frontières d'entrée et de sortie)

- Avantage : modèle connu et documenté.
- Inconvénient : cérémonie orientée classes ; les presenters n'apportent rien, HTTP et MCP partageant déjà leurs schémas.
- **Écartée.**

### Option C — Vertical slices sans couches

- Avantage : rapide à écrire, une fonctionnalité dans un seul dossier.
- Inconvénient : rien ne protège les invariants d'un domaine riche.
- **Écartée.**

### Option D — DDD complet avec CQRS et event sourcing

- Avantage : historique reconstruit à partir des événements.
- Inconvénient : coût élevé alors que l'historique est déjà une table en ajout seul (ADR 0019).
- **Écartée.**

## Décision

### 1. Le domaine est pur

Le domaine est fait de types immuables, d'identifiants typés par concept et de fonctions qui décident et renvoient un `Result`. Il n'importe ni infrastructure, ni framework, ni horloge : l'instant métier est un paramètre.

### 2. Un use-case reçoit ses dépendances, puis une commande et un acteur

Un use-case est une fonction en deux temps : elle reçoit d'abord les ports dont elle a besoin, puis une commande et un acteur, et renvoie une promesse de `Result`. Les ports sont déclarés par la couche `application`.

### 3. L'acteur est la seule source de l'autorisation et de l'auteur

L'acteur porte l'utilisateur authentifié et, quand l'IA agit, le client OAuth. Le use-case l'autorise avec `can` (ADR 0017) et l'inscrit comme auteur de l'entrée d'historique (ADR 0019 §4).

### 4. La donnée et son entrée d'historique partagent une transaction

Un use-case d'écriture ouvre une unité de travail. Les dépôts et l'écriture de l'historique y partagent la même transaction ; un échec de l'une annule l'autre.

### 5. Les agrégats n'existent que là où il y a des invariants

L'espace et ses membres, le lot de propositions, le composant et sa version validée sont des agrégats. Les autres données restent des entités simples tant qu'aucun invariant ne l'exige.

### 6. Les lectures passent par des requêtes dédiées

Une lecture ne charge pas d'agrégat : un port de requête renvoie une vue taillée pour la sortie. Elle autorise l'acteur comme une écriture.

### 7. La présentation est mince

Une route Hono et un outil MCP valident l'entrée par le schéma du contrat, construisent l'acteur, appellent le use-case et traduisent son résultat. Une table unique traduit les erreurs du domaine en problem+json (RFC 9457) et en erreur d'outil MCP.

### 8. Un point d'assemblage unique

Une fonction construit l'application à partir de ses dépendances, sans conteneur d'injection. Les tests l'appellent avec une base de test, une horloge et un générateur d'identifiants contrôlés.

## Conséquences

### Positives

- Les règles du domaine se testent sans infrastructure.
- Aucune route ni aucun outil ne contourne l'autorisation ou l'historique : les deux vivent dans le use-case.
- Le MCP peut sortir dans un service séparé sans réécrire de logique.

### Négatives

- Chaque use-case demande ses ports, son acteur et son unité de travail, même quand il est simple.
- La traduction des lignes de base en objets du domaine est du code de plus à maintenir.

### Risques et mitigations

- **Un use-case oublie l'autorisation ou l'historique** : le test d'intégration de chaque use-case vérifie le refus d'un non-membre et l'entrée écrite.
- **Le domaine importe une dépendance d'infrastructure** : une règle de lint interdit au domaine d'importer Drizzle, Hono, le SDK MCP, better-auth et `node:crypto`.
- **Des faux dépôts divergent de PostgreSQL** : les tests d'intégration utilisent la vraie base ; seuls l'horloge, les identifiants et l'envoi d'email sont remplacés.

## Notes d'implémentation

- Ports transverses : `UnitOfWork`, `HistoryWriter` (sans modification ni suppression), `Clock`, `IdGenerator`, `Mailer`.
- `Result` repris tel quel de `twitch` (`packages/result`).
- Premier module à l'appliquer : `identity` ; l'espace et l'historique sont les premiers à exercer l'acteur, l'unité de travail et `HistoryWriter`.

## Liens

- [ADR 0007](0007-un-seul-backend-api-et-mcp-streamable-http-oauth.md) — mêmes use-cases pour l'API et le MCP.
- [ADR 0008](0008-hono-pour-le-backend-better-auth-pour-l-authentification.md) — Hono et le style fonctionnel.
- [ADR 0017](0017-les-roles-des-membres-vivent-dans-une-table-de-l-espace-evalues-par-une-fonction-pure.md) — `can` autorise l'acteur.
- [ADR 0019](0019-l-historique-est-en-ajout-seul-pour-l-app-la-purge-passe-par-un-role-dedie.md) — forme d'une entrée d'historique.
- [ADR 0020](0020-modules-et-couches-de-l-api-imposes-par-des-regles-oxlint.md) — modules et couches que cet ADR remplit.
- [ADR 0021](0021-seuls-les-appels-mcp-qui-visent-un-espace-ou-un-projet-entrent-dans-l-historique.md) — appels MCP journalisés.
