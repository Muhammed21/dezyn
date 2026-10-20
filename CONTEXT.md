# dezyn

Plateforme centrale de design pensée pour l'IA : la source de vérité du design d'un projet, que l'IA du client lit et écrit via MCP, et qu'un humain consulte et valide.

## Language

### Produit

**dezyn** :
La plateforme elle-même, source de vérité du design de ses projets. « La plateforme » est accepté comme synonyme.
_À éviter_ : Momo (désigne la personne), outil Figma → code, pont

### Organisation

**Espace** :
Ce qui possède des projets et porte un plan, Free ou Team. Un utilisateur seul a un espace personnel.
_À éviter_ : compte, organisation, workspace, équipe

**Membre** :
Un utilisateur qui appartient à un espace et travaille sur ses projets, avec le rôle de propriétaire ou d'éditeur.
_À éviter_ : collaborateur, utilisateur (quand on parle de son rôle dans un espace)

**Propriétaire** :
Un membre qui gère le plan et les membres d'un espace, et crée ses projets ; il peut aussi tout ce que peut un éditeur. Un espace a toujours au moins un propriétaire.
_À éviter_ : admin, owner

**Éditeur** :
Le membre qui modifie les projets d'un espace et valide ou rejette les données proposées.
_À éviter_ : contributeur, designer (comme rôle)

**Projet** :
Un design system complet (tokens, composants, décisions) qui appartient à un espace ; c'est l'unité que comptent les plans.
_À éviter_ : DA, direction artistique, design system (pour désigner le conteneur)

### Design

**Token** :
Une valeur de design nommée d'un projet : couleur, typographie, dimension, effet ou animation.
_À éviter_ : variable, style

**Mode** :
Une des valeurs d'un modificateur, par exemple clair ou sombre ; chaque mode déclare les mêmes tokens.
_À éviter_ : thème, contexte

**Modificateur** :
Un axe qui regroupe des modes, par exemple « apparence » (clair, sombre) ou « marque ».
_À éviter_ : thème, dimension, mode

**Thème** :
La combinaison d'un mode par modificateur, par exemple sombre + Healthcare ; c'est elle que lit l'IA ou que sert un export.
_À éviter_ : mode, palette

**Composant** :
Un élément d'interface d'un projet, stocké en web interactif.
_À éviter_ : widget, bloc, maquette

**Variante** :
Une combinaison nommée de propriétés d'un composant, par exemple un bouton primaire désactivé ; chaque variante a sa propre version validée.
_À éviter_ : état (seul), déclinaison

**Décision** :
Un choix de design accompagné de sa justification, rattaché aux tokens qu'il fixe ; elle et ses tokens sont proposés, validés ou rejetés ensemble, et un token qu'elle fixe ne change que par une nouvelle décision. Exemple : « le corps de texte est en Manrope, pas en Poppins ».
_À éviter_ : changement, entrée d'historique

**Doublon** :
Un token dont la valeur est identique, dans chaque mode, à celle d'un autre token du même projet, extensions mises à part. Un token qui référence un autre token, par sa valeur entière ou par un de ses champs, n'est pas un doublon.
_À éviter_ : copie, duplicata

**Extension** :
Une donnée propre à un outil, rangée dans un token sous une clé d'espace de noms (par exemple `com.figma`), que dezyn conserve et rend sans l'interpréter.
_À éviter_ : métadonnée, propriété personnalisée

### Figma

**État Figma** :
Ce que l'IA du client a constaté, à une date donnée, en comparant un token avec Figma. Un token qu'aucune IA n'a comparé n'a pas d'état Figma.
_À éviter_ : statut (seul), synchro

**Synchronisé** :
État Figma d'un token qui existe dans Figma avec la même valeur dans chaque mode.
_À éviter_ : à jour

**Divergent** :
État Figma d'un token qui existe dans Figma avec une valeur différente dans au moins un mode.
_À éviter_ : désynchronisé, en conflit

**Absent de Figma** :
État Figma d'un token qui n'existe pas dans Figma.
_À éviter_ : manquant, supprimé

**Doublon dans Figma** :
État Figma d'un token auquel correspondent plusieurs variables Figma.
_À éviter_ : doublon (seul), qui désigne un doublon dans dezyn

### Relecture

**Proposition** :
Une création, une modification ou une suppression de donnée de design (token, composant, décision) écrite par l'IA, en attente de relecture ; tant qu'elle attend, la valeur validée qu'elle modifie continue de faire foi.
_À éviter_ : suggestion, brouillon, changement

**Lot de propositions** :
Les propositions qu'écrit l'IA dans un projet, sous l'intention qu'elle déclare ou dans un lot ouvert automatiquement, relues ensemble ; un éditeur peut valider le lot en rejetant certaines propositions. Un lot appartient à un seul projet.
_À éviter_ : import, batch, paquet

**Intention** :
Le but que l'IA déclare en ouvrant un lot de propositions, par exemple « Import du Figma Healthcare » ; il dit à l'éditeur pourquoi le lot existe.
_À éviter_ : description, message, titre

**Proposée** :
Statut d'une proposition qu'aucun éditeur n'a encore relue ; elle ne fait pas foi.
_À éviter_ : brouillon

**Validée** :
Statut d'une proposition acceptée par un éditeur, et de la donnée qu'elle devient ; une donnée écrite directement par un membre est validée d'emblée. Seules les données validées font foi pour le projet. Un snapshot ne se valide pas, il s'accepte.
_À éviter_ : approuvée, publiée

**Rejetée** :
Statut d'une proposition qu'un éditeur a refusée.
_À éviter_ : supprimée, annulée

**Remplacée** :
Statut d'une proposition encore en attente qui a été remplacée par une proposition plus récente de l'IA sur la même donnée, par le retour de l'IA à la valeur validée, ou par l'écriture directe d'un membre ; elle n'est plus à relire.
_À éviter_ : obsolète, annulée

**Historique** :
La chronologie unique de ce que l'IA et les membres ont fait dans un projet, avec l'auteur et la date de chaque action. Chaque projet a son propre historique, supprimé avec lui ; un espace n'en a pas.
_À éviter_ : journal, logs, audit

**Membre supprimé** :
L'auteur pseudonyme et numéroté par espace qui remplace, dans l'historique, un utilisateur ayant supprimé son compte, ainsi que l'IA qu'il avait autorisée.
_À éviter_ : utilisateur anonyme, inconnu, ancien membre

### Régression visuelle

**Rendu** :
L'image d'une variante de composant telle qu'elle est stockée dans dezyn.
_À éviter_ : aperçu, capture

**Snapshot** :
L'image d'une variante de composant codée dans le repo du client, envoyée par sa CI.
_À éviter_ : capture, screenshot

**Référence de conformité** :
Le rendu de la version validée d'une variante, auquel on compare un snapshot pour savoir si le code correspond au design.
_À éviter_ : référence (seul), maquette

**Référence de régression** :
Le dernier snapshot accepté d'une variante, auquel on compare le suivant pour détecter une dérive du code.
_À éviter_ : référence (seul), baseline

**Écart** :
La différence entre un snapshot et l'une de ses deux références. Un écart de régression s'accepte ; un écart de conformité se résout en corrigeant le code ou en modifiant le design.
_À éviter_ : diff, régression (pour un écart de conformité)

**Verdict** :
Le résultat renvoyé à la CI du client pour un snapshot, en conformité comme en régression : conforme, écart, ou sans référence quand la référence n'existe pas encore.
_À éviter_ : statut, résultat de test
