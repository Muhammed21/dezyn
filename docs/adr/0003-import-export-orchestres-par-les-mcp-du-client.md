# 0003 — Import et export Figma ou repo orchestrés par l'IA du client via ses MCP, sans intégration d'API tierce

- Statut : Proposé
- Date : 2026-10-14
- Décideurs : Muhammed

## Contexte et problématique

Au démarrage, la plateforme est vide : la source de vérité d'un projet existant est son Figma ou son repo (L31–35). Inversement, un projet créé dans la plateforme doit pouvoir s'écrire dans un Figma (L25).

L'IA du client dispose déjà de MCP pour Figma et d'un accès au repo (L23, L27–29).

Problématique : la plateforme intègre-t-elle elle-même les API de Figma et des autres outils, ou laisse-t-elle l'IA du client faire le pont avec ses propres MCP ?

## Facteurs de décision

- Coût de maintenance des intégrations tierces (L31).
- Coût d'IA pour la plateforme (ADR 0002).
- Fluidité de l'onboarding depuis l'app d'IA de l'utilisateur (L23).

## Options envisagées

### Option A — Intégration directe de l'API Figma et des autres outils

- Avantage : import et export maîtrisés par la plateforme.
- Inconvénient : une intégration à maintenir par outil (L31).
- **Écartée** : la plateforme ne veut gérer ni l'API Figma ni celles des futurs outils.

### Option B — L'IA du client orchestre ses MCP

L'IA lit Figma via le MCP Figma ou le repo, et écrit dans la plateforme via le MCP de la plateforme, dans la même conversation (L23, L31–35).

- Avantage : aucune API tierce à maintenir (L31).
- Avantage : la base se remplit au passage, pendant que l'IA répond à l'utilisateur (L33–35).
- Inconvénient : dépend du MCP Figma du client.
- **Retenue.**

## Décision

### 1. Pas de client d'API tierce dans la plateforme

La plateforme n'appelle ni l'API Figma ni l'API d'un autre outil de design ou de code.

### 2. Démarrage à froid par l'IA du client

Pour un projet existant, l'IA lit le Figma ou le repo avec ses propres accès et écrit le résultat dans la plateforme via son MCP (L31–35).

### 3. Export inverse par l'IA du client

Pour écrire un design de la plateforme dans un Figma, l'IA lit la plateforme via son MCP et écrit dans Figma via le MCP Figma (L25). C'est l'IA qui décide où elle lit et où elle écrit (L27–29).

### 4. Toute lecture de Figma alimente la plateforme avant la réponse

Au-delà du démarrage à froid, chaque fois que l'IA récupère des éléments depuis Figma alors que le MCP de la plateforme est connecté, elle les inscrit dans la plateforme avant de répondre à l'utilisateur. Une équipe qui garde Figma comme outil de travail n'a rien à migrer.

## Conséquences

### Positives

- Aucune intégration tierce à maintenir (L31).
- Toute nouvelle source ou cible accessible par MCP fonctionne sans changement de la plateforme.
- La plateforme se tient à jour au fil de l'usage, sans import à relancer.

### Négatives

- L'import dépend du MCP Figma du client et de ses évolutions.
- La plateforme ne garantit pas la fidélité de l'import : elle reçoit ce que l'IA écrit.
- L'écriture avant la réponse dépend de l'IA du client : la plateforme ne peut pas la forcer.
- L'export « en un clic » vers Figma (L25) passe par l'IA, pas par un bouton de la plateforme.

### Risques et mitigations

- **Import infidèle ou incomplet** : mitigé par la relecture humaine (ADR 0001 §4) et le journal des appels (ADR 0004).

## Notes d'implémentation

L'onboarding se fait depuis l'app d'IA de l'utilisateur, qui appelle le MCP Figma et le MCP de la plateforme ensemble (L23).

## Liens

- [ADR 0001](0001-plateforme-centrale-de-design-plutot-que-pont-figma-code.md) — l'import réduit le double travail du designer.
- [ADR 0002](0002-ia-du-client-via-mcp-sans-ia-embarquee.md) — l'IA du client est celle qui orchestre.
- [Synthèse de la discussion du 13/10/2026](../synthese.md)
