import { markup, type SafeHtml } from "./html.ts";

export const LOGIN_PATH = "/login";
export const CONSENT_PATH = "/consent";

export const PAGE_MESSAGES = {
  credentials: "Email ou mot de passe incorrect.",
  expired: "Cette demande a expiré. Revenez à votre IA et recommencez.",
} as const;

type FormState = { readonly csrf: string; readonly oauthQuery: string };

const renderDocument = ({ title, body }: { title: string; body: SafeHtml }): string =>
  `<!doctype html>${markup`<html lang="fr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light dark" />
      <title>${title}</title>
    </head>
    <body>
      <main>${body}</main>
    </body>
  </html>`.toString()}`;

const hiddenFields = ({ csrf, oauthQuery }: FormState): SafeHtml =>
  markup`<input type="hidden" name="csrf" value="${csrf}" />
    <input type="hidden" name="oauth_query" value="${oauthQuery}" />`;

const errorMessage = (error: string | undefined): SafeHtml | string =>
  error === undefined ? "" : markup`<p role="alert">${error}</p>`;

export const renderLoginPage = ({
  email = "",
  error,
  ...form
}: FormState & { readonly email?: string; readonly error?: string }): string =>
  renderDocument({
    title: "Connexion à dezyn",
    body: markup`<h1>Connexion à dezyn</h1>
      <form method="post" action="${LOGIN_PATH}">
        ${errorMessage(error)}
        <label for="email">Email</label>
        <input id="email" name="email" type="email" value="${email}" autocomplete="email" required />
        <label for="password">Mot de passe</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        ${hiddenFields(form)}
        <button type="submit">Se connecter</button>
      </form>`,
  });

export const renderConsentPage = ({
  clientName,
  ...form
}: FormState & { readonly clientName: string }): string =>
  renderDocument({
    title: "Autoriser l'accès à dezyn",
    body: markup`<h1>Autoriser l'accès à dezyn</h1>
      <form method="post" action="${CONSENT_PATH}">
        <p><strong>${clientName}</strong> demande l'accès à votre compte dezyn.</p>
        ${hiddenFields(form)}
        <button type="submit" name="accept" value="true">Autoriser</button>
        <button type="submit" name="accept" value="false">Refuser</button>
      </form>`,
  });

export const renderExpiredPage = (): string =>
  renderDocument({
    title: "Demande expirée",
    body: markup`<h1>Demande expirée</h1><p>${PAGE_MESSAGES.expired}</p>`,
  });
