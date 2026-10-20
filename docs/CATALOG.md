# Catalogue de la documentation

<!-- Généré par packages/docs-catalog. Ne pas modifier à la main : lancer `pnpm generate`. -->

**Type:** reference

Chaque page de `docs/`, une ligne chacune : titre, [mode](README.md#carte), statut et objet. La ligne situe la page ; la page elle-même fait foi.

## Charte

- [Documentation](README.md) — _reference_ — Comment la documentation est organisée, où la lire et où écrire.
- [Momo : synthèse du projet](synthese.md) — _reference_ — Momo construit un outil qui récupère fidèlement un design Figma pour le passer en code.

## ADR — décisions durables

- [0001 — Plateforme centrale de design pensée pour l'IA plutôt que pont Figma → code](adr/0001-plateforme-centrale-de-design-plutot-que-pont-figma-code.md) — _explanation · Accepté_ — Le produit reste-t-il un pont entre Figma et le code, ou devient-il la source de vérité du design que l'IA lit et écrit ?
- [0002 — L'IA du client lit et écrit via le MCP de la plateforme, sans IA embarquée](adr/0002-ia-du-client-via-mcp-sans-ia-embarquee.md) — _explanation · Accepté_ — Qui exécute l'IA qui alimente et interroge la plateforme, et qui paie ses tokens ?
- [0003 — Import et export Figma ou repo orchestrés par l'IA du client via ses MCP, sans intégration d'API tierce](adr/0003-import-export-orchestres-par-les-mcp-du-client.md) — _explanation · Accepté_ — La plateforme intègre-t-elle elle-même les API de Figma et des autres outils, ou laisse-t-elle l'IA du client faire le pont avec ses propres MCP ?
- [0004 — Historique unique des actions de l'IA et des humains pour le suivi, l'auto-correction et l'audit](adr/0004-historique-unique-des-actions-de-l-ia-et-des-humains.md) — _explanation · Accepté_ — Comment savoir qui, de l'IA ou d'un humain, a fait quoi et quand dans la plateforme ?
- [0005 — Régression visuelle des composants à partir des snapshots envoyés par la CI, comparés au design et au dernier snapshot validé](adr/0005-regression-visuelle-des-snapshots-envoyes-par-la-ci.md) — _explanation · Accepté_ — Comment la plateforme vérifie-t-elle que le composant codé correspond au design et ne régresse pas ?
- [0006 — Plan Free à 3 projets et 500 Mo, plan Team à 34,99 €/mois et 20 Go, MCP complet dans tous les plans](adr/0006-plans-free-et-team-mcp-complet-dans-tous-les-plans.md) — _explanation · Accepté_ — Sur quoi portent les plans payants, sans retirer la gratuité du MCP ?
- [0007 — Un seul backend qui expose l'API HTTP et le MCP en Streamable HTTP, authentifié par OAuth 2.1](adr/0007-un-seul-backend-api-et-mcp-streamable-http-oauth.md) — _explanation · Accepté_ — Le MCP et l'API forment-ils un seul service ou deux, et comment l'IA du client s'authentifie-t-elle auprès du MCP ?
- [0008 — Hono pour le backend, better-auth pour l'authentification et le serveur OAuth du MCP](adr/0008-hono-pour-le-backend-better-auth-pour-l-authentification.md) — _explanation · Accepté_ — Quel framework porte le backend, et quelle brique fournit l'authentification et le serveur OAuth du MCP ?
- [0009 — Drizzle ORM pour PostgreSQL, migrations appliquées par `migrator` hors du démarrage de l'app](adr/0009-drizzle-pour-postgresql-migrations-hors-demarrage.md) — _explanation · Accepté_ — Comment le backend décrit-il son schéma, fait-il ses requêtes, et qui applique les migrations, quand ?
- [0010 — Tokens de design au format DTCG, modes décrits par le module Resolver](adr/0010-tokens-au-format-dtcg-modes-par-le-resolver.md) — _explanation · Accepté_ — Sur quel modèle reposent les tokens de design, et comment représenter leurs modes ?
- [0011 — L'espace possède les projets et porte le plan, ses membres sont propriétaires ou éditeurs](adr/0011-l-espace-possede-les-projets-et-porte-le-plan.md) — _explanation · Accepté_ — À qui appartiennent les projets et le plan, et quels droits ont les personnes qui travaillent ensemble sur un même projet ?
- [0012 — Les écritures de l'IA sont des propositions, relues par lot et validées ou rejetées par un éditeur](adr/0012-les-ecritures-de-l-ia-sont-des-propositions-relues-par-un-editeur.md) — _explanation · Accepté_ — Quand une écriture de l'IA fait-elle foi pour le projet, et comment un éditeur la relit-il ?
- [0013 — Lots de propositions déclarés par l'IA, propositions remplacées et écritures identiques](adr/0013-lots-de-propositions-declares-par-l-ia-propositions-remplacees-et-ecritures-identiques.md) — _explanation · Accepté_ — Qu'est-ce qui délimite un lot de propositions, et que devient une écriture de l'IA qui ne change rien ou qui revient sur une proposition encore en attente ?
- [0014 — La conformité se mesure contre la version validée d'un composant](adr/0014-la-conformite-se-mesure-contre-la-version-validee-d-un-composant.md) — _explanation · Accepté_ — Contre quel rendu un snapshot est-il comparé pour la conformité, quand une variante a des propositions en attente ou n'a encore aucune version validée ?
- [0015 — L'historique garde les actions d'un compte supprimé sous un membre supprimé pseudonyme](adr/0015-l-historique-garde-les-actions-d-un-compte-supprime-sous-un-membre-supprime.md) — _explanation · Accepté_ — Que deviennent les entrées d'historique d'un membre qui quitte un espace ou qui supprime son compte ?
- [0016 — La purge d'un espace commence par le projet qui consomme le plus](adr/0016-la-purge-d-un-espace-commence-par-le-projet-qui-consomme-le-plus.md) — _explanation · Accepté_ — À la limite de stockage d'un espace, dans quel projet la purge commence-t-elle ?
- [0017 — Les rôles des membres vivent dans une table de l'espace et sont évalués par une fonction pure](adr/0017-les-roles-des-membres-vivent-dans-une-table-de-l-espace-evalues-par-une-fonction-pure.md) — _explanation · Accepté_ — Où vivent les membres et leurs rôles, et comment évalue-t-on ce qu'un membre peut faire ?
- [0018 — Jetons d'accès JWT liés à l'API, session vérifiée en base à chaque appel](adr/0018-jetons-d-acces-jwt-lies-a-l-api-session-verifiee-en-base-a-chaque-appel.md) — _explanation · Accepté_ — Quelle forme ont les jetons d'accès, et comment l'API vérifie-t-elle qu'un jeton n'est pas révoqué ?
- [0019 — L'historique est en ajout seul pour l'app ; la purge passe par un rôle dédié](adr/0019-l-historique-est-en-ajout-seul-pour-l-app-la-purge-passe-par-un-role-dedie.md) — _explanation · Accepté_ — Comment empêche-t-on l'app de modifier ou d'effacer l'historique, tout en permettant la purge ?
- [0020 — Modules et couches de l'API imposés par des règles oxlint](adr/0020-modules-et-couches-de-l-api-imposes-par-des-regles-oxlint.md) — _explanation · Accepté_ — Comment l'API est-elle découpée, et comment ce découpage est-il tenu dans le temps ?
- [0021 — Seuls les appels MCP qui visent un espace ou un projet entrent dans l'historique](adr/0021-seuls-les-appels-mcp-qui-visent-un-espace-ou-un-projet-entrent-dans-l-historique.md) — _explanation · Accepté_ — Un appel d'outil MCP qui ne vise ni un espace ni un projet entre-t-il dans l'historique ?
- [0022 — Architecture hexagonale à cœur fonctionnel pour le backend](adr/0022-architecture-hexagonale-a-coeur-fonctionnel-pour-le-backend.md) — _explanation · Accepté_ — Quelle architecture le backend suit-il à l'intérieur des modules et des couches de l'ADR 0020 ?
- [0023 — Réponses ouvertes, enums ouverts et unions extensibles dans les contrats](adr/0023-reponses-ouvertes-enums-ouverts-et-unions-extensibles-dans-les-contrats.md) — _explanation · Accepté_ — Comment s'écrivent les schémas de sortie pour qu'un ajout de la plateforme ne casse pas un client déjà en service ?
- [0024 — L'état Figma d'un token est déclaré par l'IA du client](adr/0024-l-etat-figma-d-un-token-est-declare-par-l-ia-du-client.md) — _explanation · Accepté_ — Qui établit l'état Figma d'un token, et que devient la valeur trouvée dans Figma quand elle diffère de celle de dezyn ?
- [0025 — L'historique appartient au projet ; un espace n'en a pas](adr/0025-l-historique-appartient-au-projet-un-espace-n-en-a-pas.md) — _explanation · Accepté_ — L'historique appartient-il au projet seul, ou aussi à l'espace, et où vont les actions qui ne visent que l'espace ?
- [0026 — Suppressions, écritures des membres, variantes et décisions dans la relecture des propositions](adr/0026-suppressions-ecritures-des-membres-variantes-et-decisions-dans-la-relecture-des-propositions.md) — _explanation · Accepté_ — Comment se proposent les suppressions de l'IA, que devient une proposition en attente quand un membre écrit sur la même donnée, qu'est-ce qui se relit dans un composant, et…
- [0027 — Un membre parti reste nommé dans l'historique de chaque projet de l'espace](adr/0027-un-membre-parti-reste-nomme-dans-l-historique-de-chaque-projet-de-l-espace.md) — _explanation · Accepté_ — Où l'historique montre-t-il qu'un auteur a quitté l'espace, maintenant qu'un espace n'a pas d'historique ?
- [0028 — Types de token `gradient`, `fontFamily`, `fontWeight` et `number`](adr/0028-types-de-token-gradient-fontfamily-fontweight-et-number.md) — _explanation · Accepté_ — Quels types de token dezyn ajoute-t-il maintenant, et lesquels attendent ?
- [0029 — Un champ d'une valeur composée peut référencer un token](adr/0029-un-champ-d-une-valeur-composee-peut-referencer-un-token.md) — _explanation · Accepté_ — Un champ d'une valeur composée peut-il référencer un token, et qu'est-ce que cela change aux règles des références, aux doublons et au stockage ?
- [0030 — dezyn conserve les extensions d'un token sans les interpréter](adr/0030-dezyn-conserve-les-extensions-d-un-token-sans-les-interpreter.md) — _explanation · Accepté_ — Dezyn accepte-t-il `$extensions`, et ces extensions comptent-elles pour l'écriture identique et pour le doublon ?
- [Décisions d'architecture](adr/README.md) — _explanation_ — Format et circuit : voir `.claude/rules/adr-et-spikes.md`.

## Spikes — recherche bornée

- [Spike — seuil par défaut de la régression visuelle](spikes/2026-10-14-seuil-de-regression-visuelle.md) — _explanation_ — Le seuil par défaut de l'ADR 0005 (tolérance de couleur 0,1 par pixel, échec au-delà de 0,1 % de pixels différents) laisse-t-il passer le bruit de rendu entre la plateforme et le…

## agents

- [Documentation du domaine](agents/domain.md) — _reference_ — Comment les skills d'ingénierie lisent la documentation du domaine de ce dépôt quand ils explorent le code.
- [Suivi des tickets : GitHub](agents/issue-tracker.md) — _reference_ — Les tickets et les specs de ce dépôt vivent dans les GitHub Issues de `Muhammed21/dezyn`.
- [Labels de triage](agents/triage-labels.md) — _reference_ — Les skills parlent en termes de cinq rôles de triage canoniques, chacun porté par un label des GitHub Issues du dépôt.
