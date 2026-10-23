import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  CLIENT_REDIRECT,
  decodeJwtPart,
  exchangeCode,
  formFields,
  makeBrowser,
  makeClientIp,
  makePkce,
  reachConsent,
  RESOURCE,
  signInAndConsent,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { schema } from "@repo/db";

const titleOf = (html: string): string | undefined => /<title>([^<]*)<\/title>/.exec(html)?.[1];

const visibleTextOf = (html: string): string =>
  html
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter((word) => word !== "")
    .join(" ");

const DAY_MS = 24 * 60 * 60 * 1000;

const publishedKeyIds = async (app: App) => {
  const { keys } = await (await app.request(`${BASE_URL}/auth/jwks`)).json();
  return keys.map(({ kid }: { kid: string }) => kid);
};

describe("autorisation d'une IA par l'utilisateur", () => {
  it("l'IA autorisée reçoit un jeton at+jwt pour la ressource /v1, au nom de l'utilisateur", () =>
    withIdentityApp(async (app) => {
      const { clientId, userId, pkce, consentHtml, callback } = await signInAndConsent(app, {
        accept: true,
      });

      expect(consentHtml).toContain("Claude Code");
      expect(`${callback.origin}${callback.pathname}`).toBe(CLIENT_REDIRECT);
      expect(callback.searchParams.get("state")).toBe("etat-du-client");
      const token = await exchangeCode(app, {
        clientId,
        code: callback.searchParams.get("code") ?? "",
        verifier: pkce.verifier,
      });
      expect(token.status).toBe(200);
      const { access_token: accessToken } = await token.json();
      expect(decodeJwtPart(accessToken, 0)).toMatchObject({ typ: "at+jwt" });
      expect(decodeJwtPart(accessToken, 1)).toMatchObject({ aud: RESOURCE, sub: userId });
    }));

  it("un refus renvoie l'utilisateur vers le client avec access_denied, sans code", () =>
    withIdentityApp(async (app) => {
      const { callback } = await signInAndConsent(app, { accept: false });

      expect(`${callback.origin}${callback.pathname}`).toBe(CLIENT_REDIRECT);
      expect(callback.searchParams.get("error")).toBe("access_denied");
      expect(callback.searchParams.get("state")).toBe("etat-du-client");
      expect(callback.searchParams.has("code")).toBe(false);
    }));

  it("un échange de code sans le bon code_verifier est refusé", () =>
    withIdentityApp(async (app) => {
      const { clientId, callback } = await signInAndConsent(app, { accept: true });

      const token = await exchangeCode(app, {
        clientId,
        code: callback.searchParams.get("code") ?? "",
        verifier: makePkce().verifier,
      });

      expect(token.status).toBe(401);
      const body = await token.json();
      expect(body).toMatchObject({ error: "invalid_request" });
      expect(body).not.toHaveProperty("access_token");
    }));

  it("le refresh token n'est stocké que haché", () =>
    withIdentityApp(async (app, db) => {
      const { clientId, pkce, callback } = await signInAndConsent(app, { accept: true });
      const token = await exchangeCode(app, {
        clientId,
        code: callback.searchParams.get("code") ?? "",
        verifier: pkce.verifier,
      });
      const { refresh_token: refreshToken } = await token.json();

      const stored = await db.orm
        .select({ token: schema.identityOAuthRefreshToken.token })
        .from(schema.identityOAuthRefreshToken);

      expect(refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(stored).toEqual([
        { token: createHash("sha256").update(refreshToken).digest("base64url") },
      ]);
    }));

  it("un consentement sans le jeton du formulaire, ou venu d'une autre origine, est refusé", () =>
    withIdentityApp(async (app) => {
      const { browser, consentHtml } = await reachConsent(app);
      const fields = { ...formFields(consentHtml), accept: "true" };

      const withoutToken = await browser.postForm("/consent", { ...fields, csrf: "" });
      const otherToken = await browser.postForm("/consent", { ...fields, csrf: "un-autre-jeton" });
      const otherOrigin = await browser.postForm("/consent", fields, {
        origin: "https://pirate.example",
      });

      expect([withoutToken.status, otherToken.status, otherOrigin.status]).toEqual([403, 403, 403]);
      expect(await withoutToken.text()).toBe("Forbidden");
      expect((await browser.postForm("/consent", fields)).headers.get("location")).toMatch(
        /^http:\/\/localhost:33418\/callback\?code=/,
      );
    }));

  it("un mauvais mot de passe réaffiche la connexion avec un message, sans aller au consentement", () =>
    withIdentityApp(async (app) => {
      const { status, consentHtml } = await reachConsent(app, { password: "pas-le-bon-mot" });

      expect(status).toBe(401);
      expect(consentHtml).toContain("Email ou mot de passe incorrect.");
      expect(consentHtml).not.toContain("demande l'accès");
    }));

  it("le nom du client est affiché comme du texte, jamais comme du HTML", () =>
    withIdentityApp(async (app) => {
      const { consentHtml } = await reachConsent(app, {
        clientName: `<script>alert("dezyn", 'mcp')</script>`,
      });

      expect(consentHtml).toContain(
        "&lt;script&gt;alert(&quot;dezyn&quot;, &#39;mcp&#39;)&lt;/script&gt;",
      );
      expect(consentHtml).not.toContain("<script>");
    }));

  it("la connexion refuse un formulaire sans le jeton de la page, ou venu d'une autre origine", () =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      const browser = makeBrowser(app, ip);
      const fields = {
        ...formFields(await (await browser.get("/login")).text()),
        email: ADA.email,
        password: ADA.password,
      };

      const withoutToken = await browser.postForm("/login", { ...fields, csrf: "" });
      const otherOrigin = await browser.postForm("/login", fields, {
        origin: "https://pirate.example",
      });
      const withoutCookie = await makeBrowser(app, ip).postForm("/login", { ...fields, csrf: "" });

      expect([withoutToken.status, otherOrigin.status, withoutCookie.status]).toEqual([
        403, 403, 403,
      ]);
      expect(await withoutToken.text()).toBe("Forbidden");
    }));

  it("la page de connexion n'est pas mise en cache et pose son jeton dans un cookie HttpOnly SameSite=Strict", () =>
    withIdentityApp(async (app) => {
      const response = await app.request(`${BASE_URL}/login`);

      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("set-cookie")).toMatch(
        /^dezyn_csrf=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict$/,
      );
      expect(await response.text()).not.toContain('role="alert"');
    }));

  it("la page de connexion s'ouvre sans message et avec un email vide", () =>
    withIdentityApp(async (app) => {
      const html = await (await app.request(`${BASE_URL}/login`)).text();

      expect(visibleTextOf(html)).toBe(
        "Connexion à dezyn Connexion à dezyn Email Mot de passe Se connecter",
      );
      expect(html).toMatch(/name="email" type="email" value=""/);
    }));

  it("chaque page porte son titre", () =>
    withIdentityApp(async (app) => {
      const login = await (await app.request(`${BASE_URL}/login`)).text();
      const { browser, consentHtml } = await reachConsent(app);
      const expired = await (await browser.get("/consent?client_id=inconnu")).text();

      expect([titleOf(login), titleOf(consentHtml), titleOf(expired)]).toEqual([
        "Connexion à dezyn",
        "Autoriser l&#39;accès à dezyn",
        "Demande expirée",
      ]);
    }));

  it("un jeton de formulaire envoyé comme fichier est refusé", () =>
    withIdentityApp(async (app) => {
      const form = new FormData();
      form.append("csrf", new File(["jeton"], "jeton.txt"));

      const response = await app.request(`${BASE_URL}/login`, {
        method: "POST",
        headers: { origin: BASE_URL },
        body: form,
      });

      expect(response.status).toBe(403);
    }));

  it("une demande de consentement inconnue ou falsifiée affiche la page d'expiration", () =>
    withIdentityApp(async (app) => {
      const { browser, consentHtml } = await reachConsent(app);
      const fields = formFields(consentHtml);

      const unknownClient = await browser.get("/consent?client_id=inconnu");
      const tampered = await browser.postForm("/consent", {
        ...fields,
        oauth_query: fields.oauth_query.replace("state=etat-du-client", "state=autre"),
        accept: "true",
      });

      expect([unknownClient.status, tampered.status]).toEqual([400, 400]);
      expect(await unknownClient.text()).toContain("Cette demande a expiré.");
      expect(await tampered.text()).toContain("Cette demande a expiré.");
    }));

  it("derrière une adresse https, le cookie du jeton de la page est Secure", () =>
    withIdentityApp(
      async (app) => {
        const response = await app.request("https://dezyn.example/login");

        expect(response.headers.get("set-cookie")).toMatch(/; Secure(;|$)/);
      },
      { baseURL: "https://dezyn.example" },
    ));
});

describe("la clé de signature des jetons tourne", () => {
  it("une clé expire 90 jours après sa création", () =>
    withIdentityApp(async (app, db) => {
      await publishedKeyIds(app);

      const [key] = await db.orm
        .select({
          createdAt: schema.identityJwks.createdAt,
          expiresAt: schema.identityJwks.expiresAt,
        })
        .from(schema.identityJwks);

      expect(Number(key?.expiresAt) - Number(key?.createdAt)).toBe(90 * DAY_MS);
    }));

  it("une clé expirée reste publiée un jour, puis quitte le JWKS", () =>
    withIdentityApp(async (app, db) => {
      const [kid] = await publishedKeyIds(app);
      const expireKey = (msAgo: number) =>
        db.orm
          .update(schema.identityJwks)
          .set({ expiresAt: new Date(Date.now() - msAgo) })
          .where(eq(schema.identityJwks.id, kid));

      await expireKey(DAY_MS / 2);
      const withinGrace = await publishedKeyIds(app);
      await expireKey(2 * DAY_MS);
      const afterGrace = await publishedKeyIds(app);

      expect(withinGrace).toContain(kid);
      expect(afterGrace).not.toContain(kid);
    }));
});
