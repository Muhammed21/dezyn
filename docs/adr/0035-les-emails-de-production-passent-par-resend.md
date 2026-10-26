# 0035 — Les emails de production passent par Resend, appelé en HTTP depuis le Worker

- Statut : Accepté
- Date : 2026-10-24
- Décideurs : Muhammed
- Amende : ADR 0034 (§6 : les emails passent par Resend, plus par Cloudflare Email Service)

## Contexte et problématique

L'ADR 0034 §6 fait passer les emails par Cloudflare Email Service, avec le binding `send_email`. Le compte Cloudflare de dezyn est sur le plan Workers Free. Sur ce plan, Email Service n'envoie qu'aux adresses vérifiées du compte. L'envoi à n'importe quel destinataire exige le plan Workers Paid, à 5 $ par mois.

Les emails de production sont les invitations à un espace et les alertes de stockage (ADR 0032). Leur volume est faible : quelques dizaines par jour au plus.

L'adaptateur Email Service est écrit et testé, sur la branche `feat/emails-cloudflare`.

Problématique : par quoi passent les emails de production tant que le compte reste sur le plan Workers Free ?

## Facteurs de décision

- Aucun coût fixe tant que le produit n'a pas d'utilisateurs payants.
- L'envoi part depuis le Worker, sans serveur à maintenir.
- Le domaine d'envoi est `dezyn.dev`, dont la zone est chez Cloudflare.
- Le retour à Email Service se fait sans réécrire les modules : seul l'adaptateur du port `Mailer` change.

## Options envisagées

### Option A — Resend, appelé avec `fetch`

- Avantage : l'offre gratuite donne 3 000 emails par mois, 100 par jour, et un domaine vérifié.
- Avantage : un seul appel HTTP (`POST https://api.resend.com/emails`), sans SDK.
- Inconvénient : une clé d'API à ranger en secret du Worker.
- Inconvénient : les adresses des destinataires passent par un sous-traitant de plus.
- Inconvénient : l'offre gratuite n'a pas de dépassement payant. Au-delà du quota, l'envoi s'arrête.
- **Retenue.**

### Option B — Passer au plan Workers Paid et garder Email Service

- Avantage : l'adaptateur est prêt, sans clé d'API à gérer.
- Inconvénient : 5 $ par mois avant le premier utilisateur payant.
- **Écartée** pour l'instant. La branche `feat/emails-cloudflare` est gardée pour y revenir.

### Option C — Un autre fournisseur HTTP (Postmark, Brevo)

- Inconvénient : rien ne le départage de Resend sur les facteurs ci-dessus.
- **Écartée** au profit de A.

## Décision

### 1. Un adaptateur Resend du port `Mailer`

Le Worker envoie chaque email par `POST https://api.resend.com/emails`, avec le secret `RESEND_API_KEY` et l'expéditeur `dezyn <MAIL_FROM>`. Un échec, qu'il soit réseau, un statut hors 2xx ou un dépassement de délai, est journalisé sans le texte de l'email et renvoie `mail_unavailable` : l'invitation répond 503, comme avec SMTP.

### 2. Les previews n'envoient pas d'email

Le Worker de preview n'a pas `RESEND_API_KEY`. Il journalise l'email sans l'envoyer, comme le prévoit l'ADR 0034 §6.

### 3. Le domaine d'envoi est vérifié chez Resend

Les enregistrements DNS que demande Resend (SPF, DKIM) sont posés dans la zone `dezyn.dev` de Cloudflare.

## Conséquences

### Positives

- La production envoie ses invitations sans coût fixe.
- Le passage à Email Service reste une affaire d'adaptateur et de configuration.

### Négatives

- Les adresses des invitées et des propriétaires d'espace sont transmises à Resend.
- Une clé d'API de plus à gérer et à faire tourner.
- Au-delà de 100 emails par jour, ou de 3 000 par mois, les invitations répondent 503 jusqu'au lendemain ou au mois suivant.

### Risques et mitigations

- Quota atteint : chaque échec est journalisé avec le statut de Resend ; le passage à l'offre payante de Resend ou à Workers Paid se décide quand les logs le montrent.
- Clé divulguée : elle n'existe que dans les secrets du Worker de production, et Resend permet de la limiter à l'envoi depuis `dezyn.dev`.

## Notes d'implémentation

1. Créer le compte Resend, ajouter le domaine `dezyn.dev` et poser ses enregistrements DNS dans Cloudflare.
2. Créer une clé « Sending access » limitée à `dezyn.dev`, puis la ranger avec `wrangler secret put RESEND_API_KEY`.
3. Brancher l'adaptateur dans `worker.ts` quand `RESEND_API_KEY` est présent.

## Liens

- [ADR 0034](0034-l-api-est-servie-par-un-worker-cloudflare.md) — son §6 est remplacé.
- [ADR 0032](0032-le-stockage-d-un-projet-se-compte-par-un-compteur-d-octets-tenu-a-chaque-ecriture.md) — les alertes de stockage partent par le même `Mailer`.
