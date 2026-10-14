# Momo : synthèse du projet

> **Source unique :** [`13_10_2026_transcript.txt`](13_10_2026_transcript.txt), conversation orale du 13/10/2026 entre Axel et Momo (43 lignes, environ 11 Ko).
> Les renvois `(L11)` pointent vers les lignes du transcript.
>
> ⚠️ **À savoir avant de lire :**
>
> - Le transcript n'indique pas qui parle. Les attributions « Momo » et « Axel » ci‑dessous sont **déduites** du contexte. Par exemple, Axel parle de Galeon et Momo de son passé de freelance avec Kylian.
> - Le transcript **s'arrête au milieu d'une phrase** (L43). La fin de la discussion manque.
> - C'est une transcription automatique : certains mots sont déformés. Ils sont corrigés dans le [glossaire](#glossaire-des-corrections-de-transcription).

---

## En 30 secondes

- **Aujourd'hui**, Momo construit un outil qui **récupère fidèlement un design Figma** (design system, tokens, composants) pour le passer en code « pixel perfect ». Il comprend un dashboard, un serveur MCP et un historique des actions de l'IA (L11–17).
- **L'idée qui est sortie de la discussion :** ne plus être un pont entre Figma et le code, mais **devenir la plateforme centrale du design**, une « base de connaissances design pensée pour l'IA ». L'IA du client y lit et y écrit via MCP, et l'humain la consulte et la valide visuellement (L19–23, L27, L41).
- **L'atout clé :** **zéro coût d'IA** pour Momo. C'est l'IA du client (Claude, ChatGPT…) qui consomme ses propres tokens. Momo livre seulement son MCP (L27, L31).
- **La promesse au client :** moins de tokens, moins de flou et moins de friction qu'en faisant lire un Figma ou un repo à l'IA, avec une relecture humaine pour repérer les hallucinations (L41–43).
- **Axel** se dit prêt à rejoindre le projet : « moi je te suis direct sur le projet » (L41).

---

## 1. Le problème de départ

| Problème                                                                                                                                        | Qui le vit                                    | Réf.   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------ |
| Transférer design systems, tokens et composants de Figma vers le code, à l'identique, est **long et pénible**                                   | Momo et Kylian quand ils étaient freelances   | L11–13 |
| On demande à l'IA « fais dans le style de la DA Healthcare » (ou de la DA crypto dorée), mais **on ne sait pas sur quels assets elle s'appuie** | Axel chez Galeon                              | L5–7   |
| Il n'existe **aucun endroit qui garde la mémoire** de la direction artistique : couleurs, typos, choix                                          | Axel                                          | L7     |
| Retrouver une couleur dans un fichier Figma pour l'envoyer à quelqu'un                                                                          | Les designers (l'outil de Momo règle déjà ça) | L1     |
| Un Figma part dans tous les sens : c'est **cher en tokens**, peu ordonné et **pas pensé pour l'IA**                                             | Tout le monde, constaté par Axel au boulot    | L41–43 |

---

## 2. Ce que Momo construit aujourd'hui

- **Ce qu'il fait :** il récupère les éléments d'un Figma **de façon hyper fidèle** pour les passer en code (L17).
- **Un dashboard** qui référence tout le contenu : couleurs, typos, composants, « en mode **Storybook++** » (L15).
- **Un MCP :** on y branche son IA, qui vient récupérer les éléments (L15).
- **Un historique des appels d'outils :** chaque appel MCP est journalisé, ce qui permet de **suivre en temps réel** ce que fait l'IA (L15).
- **Une auto‑correction :** si l'IA hallucine, on lui dit « regarde ton historique et compare ce que je t'ai demandé avec ce que tu as fait » (L17).
- **L'ambition :** un outil **« AI‑friendly »** au maximum (L11, L17).

---

## 3. Le pivot proposé : « Sois la plateforme »

**Pourquoi ce pivot :** l'argument d'Axel (L19–21) porte sur le schéma classique Figma → [outil] → Code.

- Un outil **coincé entre deux géants** finit avalé par l'un des deux. Soit il est **racheté**, soit il est **copié**, et la copie est le cas le plus fréquent (« tu t'es fait baiser »).
- Un outil qui **remplace** l'un des deux **et ajoute quelque chose** oblige les autres à le prendre en entier.

**La nouvelle vision : l'outil central du design, version 2.0** (L23, L27, L41)

- On **ne passe plus par Figma**. On conçoit en parlant à son IA, à l'écrit ou à la voix (« je veux cette section comme ça »). L'IA se connecte au MCP de Momo et génère les composants.
- Les composants sont en **vrai web**, donc **interactifs** : un Storybook qui sert aussi de stockage.
- La plateforme stocke **toutes les couleurs, toutes les typos et tout l'historique des décisions design**, et l'IA peut les appeler via le MCP.
- Elle couvre la **direction artistique et le design system** en même temps.
- Les sorties possibles sont **un Figma, du code final ou un POC**. C'est l'IA qui décide où elle lit et où elle écrit (L27–29).

---

## 4. Comment ça marche (flux cible)

```
                ┌──────────────────────────────┐
  Humain ──────▶│  Plateforme Momo (visuelle)  │◀── relecture humaine :
  (regarde,     │  DA · design system ·        │    hallucinations, ajouts
   valide)      │  composants · historique     │    indésirables (L9, L41)
                └──────────────┬───────────────┘
                               │ MCP Momo (gratuit)
                ┌──────────────▼───────────────┐
                │  IA du client (Claude, GPT…) │  ← le client paie ses tokens
                └───────┬──────────────┬───────┘
                 MCP Figma        accès repo
                        ▼              ▼
                     Figma       Code / prod / POC
```

**Phase 1, démarrage à froid (L31–35).** L'outil est vide. La source de vérité est donc le **Figma** ou le **repo** du projet. L'IA lit le Figma via le MCP Figma, puis **écrit tout dans la plateforme de Momo** au passage. Elle répond ensuite à l'utilisateur, et la base est déjà à jour. L'onboarding se fait directement depuis l'app d'IA préférée de l'utilisateur, en appelant les deux MCP ensemble (L23).

**Phase 2, enrichissement continu (L35–41).** À chaque décision design prise en discutant avec l'IA, celle‑ci l'enregistre via le MCP :

- « Couleur principale : rouge »
- « Titres : Poppins »
- « Corps de texte : pas Poppins, Manrope »

**Phase 3, la plateforme devient la référence (L41).** Désormais, l'IA **consulte d'abord la plateforme**, ce qui coûte moins de tokens que d'analyser tout un Figma ou tout un repo. La donnée y est **structurée pour l'IA** et **relue par un humain**.

**L'export inverse (L25).** Pour un nouveau projet, on crée couleurs et typos dans l'outil, puis on **écrit tout dans un Figma en un clic**.

---

## 5. Modèle économique et coûts

- **Zéro coût d'IA pour Momo.** C'est l'utilisateur qui consomme ses tokens avec sa propre licence Claude ou ChatGPT (L27, L31).
- **Pas d'intégration d'API tierce à maintenir.** On ne gère ni l'API Figma ni celles des futurs outils. Tout passe par les MCP du client, Momo livre seulement le sien (L31).
- **Le MCP de Momo est gratuit** (L31). Le MCP Figma l'est aussi.
- **Le positionnement est « AI‑first ».** On fournit un service _à une IA_, mais l'utilisateur reste humain : il veut voir les choses, il vient donc sur la plateforme pour regarder et laisse son IA faire le travail (L31). Axel fait le lien avec un podcast écouté le matin même (L31).
- Le transcript ne dit rien du **prix** ni du **modèle de revenus** de la plateforme.

---

## 6. Le lien avec l'outil d'Axel (sélections)

- Axel a construit pour Galeon un **outil de sélections**. Il permet à deux designers de se mettre d'accord sur des rapports, de choisir des sélections et de suivre les choix de l'autre (L3).
- Selon Axel, il « lui manque un truc », et c'est justement la centralisation du design proposée par Momo (L1).
- **La fusion envisagée (L9) :**
  - un hub de DA, avec typos, couleurs et une **sélection historique** ;
  - **chaque DA est reliée à un ou plusieurs projets** ;
  - chaque projet contient ses **chantiers**, réglés avec l'agent ;
  - les **sélections** permettent de trancher entre propositions.
- Axel résume : « c'est mon chantier, mais avec ton mélange de trucs » (L41).

---

## 7. Objections et points ouverts

| Sujet                                               | Ce qui a été dit                                                                                                                                   | Statut                                                                                                                                                            | Réf.   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Double travail du designer**                      | La plupart des designers sont « full Figma ». Ne pas pouvoir importer l'existant oblige à tout refaire, ce qui fait deux tâches                    | **Atténué** : l'import se fait via l'IA (MCP Figma vers la plateforme), et un nouveau projet peut démarrer directement dans l'outil                               | L23–27 |
| **Équipes avec un design system Figma solide**      | Axel reconnaît que l'objection tient pour elles                                                                                                    | **Résolu** : chaque lecture de Figma par l'IA alimente la plateforme, rien à migrer ([ADR 0003](adr/0003-import-export-orchestres-par-les-mcp-du-client.md) §4)   | L25    |
| **Le repo comme concurrent**                        | Un repo est déjà plus lisible pour l'IA que Figma : l'IA est « tellement forte en code » qu'il pourrait se lire aussi facilement que la plateforme | **Résolu** : la plateforme devient la référence contre laquelle le code est vérifié ([ADR 0005](adr/0005-regression-visuelle-des-snapshots-envoyes-par-la-ci.md)) | L43    |
| **Le problème est‑il encore d'actualité en 2026 ?** | Axel en doute pour un « truc » que Momo ne peut pas lancer. Le contexte manque, c'est le tout début du transcript                                  | **Ouvert**                                                                                                                                                        | L1     |
| **Prix du plan Figma qui débloque le MCP**          | « 9 balles par mois, je crois »                                                                                                                    | **Résolu** : le MCP Figma est gratuit, aucun plan n'est nécessaire                                                                                                | L29    |
| **Monétisation de la plateforme**                   | Pas abordée                                                                                                                                        | **Résolu** : plan Free et plan Team ([ADR 0006](adr/0006-plans-free-et-team-mcp-complet-dans-tous-les-plans.md))                                                  | —      |
| **Rôle d'Axel dans le projet**                      | « Je te suis direct sur le projet »                                                                                                                | **Intention exprimée, rien de formalisé**                                                                                                                         | L41    |

---

## 8. Personnes citées

| Nom                                | Rôle dans la discussion                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Momo**                           | Porteur du projet (outil Figma → code, dashboard, MCP)                                         |
| **Axel**                           | Interlocuteur, designer chez Galeon, auteur de l'outil de sélections                           |
| **Kylian**                         | Ancien associé freelance de Momo, qui a vécu le même problème de transfert design → code (L11) |
| **« un autre designer »** (Galeon) | Utilisateur de l'outil de sélections d'Axel (L3)                                               |

---

## Glossaire des corrections de transcription

| Dans le transcript                          | Sens probable                                         |
| ------------------------------------------- | ----------------------------------------------------- |
| « EA Friendly » (L11)                       | AI‑friendly                                           |
| « cloud » (L35, L41)                        | Claude                                                |
| « pop‑ins » (L37–39)                        | Poppins (police)                                      |
| « manrop » (L39)                            | Manrope (police)                                      |
| « l'IA va venir directement équiper » (L31) | « écrire » ou « s'équiper », incertain                |
| « surrimer » (L9)                           | Probablement « supprimer »                            |
| « ça va faire des l'ont de friction » (L41) | Probablement « ça va enlever des tonnes de friction » |
| « Health Care » (L5)                        | Healthcare (la DA santé de Galeon)                    |
