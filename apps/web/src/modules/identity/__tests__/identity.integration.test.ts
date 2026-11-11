import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  makeClientIp,
  signUp,
  withIdentityApp,
} from "@repo/api/testing/authorization-flow.ts";
import { MySpacesOutput } from "@repo/contracts";
import { err, ok } from "@repo/result";

import { makeApiBrowser } from "../../../testing/api-browser.ts";
import { createIdentity } from "../identity-module.ts";

const identityIn = (app: App, ip: string) =>
  createIdentity({ apiUrl: BASE_URL, fetch: makeApiBrowser(app, { ip }) });

describe("identité de l'app web, contre la vraie API (ADR 0044 §7)", () => {
  it("de bons identifiants ouvrent une session, que le navigateur retrouve ensuite", () =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      const userId = await signUp(app, ip);
      const identity = identityIn(app, ip);

      const signedIn = await identity.signIn({ email: ADA.email, password: ADA.password });

      expect(signedIn).toEqual(ok({ userId, email: ADA.email }));
      expect(await identity.currentSession()).toEqual(ok({ userId, email: ADA.email }));
    }));

  it("un mauvais mot de passe donne invalid_credentials, sans ouvrir de session", () =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      await signUp(app, ip);
      const identity = identityIn(app, ip);

      const signedIn = await identity.signIn({ email: ADA.email, password: "pas-le-bon" });

      expect(signedIn).toEqual(err("invalid_credentials"));
      expect(await identity.currentSession()).toEqual(ok(undefined));
    }));

  it("un navigateur sans cookie n'a aucune session", () =>
    withIdentityApp(async (app) => {
      const identity = identityIn(app, makeClientIp());

      expect(await identity.currentSession()).toEqual(ok(undefined));
    }));
});

const REGISTRATION = { name: ADA.name, email: ADA.email, password: ADA.password };

const spacesSeenBy = (app: App, ip: string) =>
  makeApiBrowser(app, { ip })(`${BASE_URL}/v1/spaces`, { method: "GET" });

describe("inscription par l'app web, contre la vraie API (ADR 0044 §7)", () => {
  it("un visiteur crée son compte et lit aussitôt son espace personnel", () =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      const browser = makeApiBrowser(app, { ip });
      const identity = createIdentity({ apiUrl: BASE_URL, fetch: browser });

      const signedUp = await identity.signUp(REGISTRATION);

      expect(signedUp).toEqual(ok({ userId: expect.any(String), email: ADA.email }));
      expect(await identity.currentSession()).toEqual(signedUp);
      const spaces = await browser(`${BASE_URL}/v1/spaces`, { method: "GET" });
      expect(spaces.status).toBe(200);
      expect(MySpacesOutput.parse(await spaces.json()).spaces).toEqual([
        expect.objectContaining({ role: "owner", plan: "free" }),
      ]);
    }));

  it("un email déjà pris donne email_taken", () =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      await signUp(app, ip);

      expect(await identityIn(app, ip).signUp(REGISTRATION)).toEqual(err("email_taken"));
    }));

  it.each([
    ["un mot de passe de 7 caractères", { password: "7-signe" }, "invalid_password"],
    ["un email invalide", { email: "ada-sans-arobase" }, "invalid_email"],
  ])("%s donne l'échec attendu, sans ouvrir de session", (_case, change, failure) =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      const identity = identityIn(app, ip);

      expect(await identity.signUp({ ...REGISTRATION, ...change })).toEqual(err(failure));
      expect((await spacesSeenBy(app, ip)).status).toBe(401);
    }),
  );
});

const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

describe("déconnexion par l'app web, contre la vraie API (ADR 0044 §7)", () => {
  it("après la déconnexion, le navigateur n'a plus de session ni d'accès à /v1", () =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      await signUp(app, ip);
      const browser = makeApiBrowser(app, { ip });
      const identity = createIdentity({ apiUrl: BASE_URL, fetch: browser });
      await identity.signIn({ email: ADA.email, password: ADA.password });
      expect((await browser(`${BASE_URL}/v1/spaces`, { method: "GET" })).status).toBe(200);

      expect(await identity.signOut()).toEqual(ok(undefined));

      expect((await browser(`${BASE_URL}/v1/spaces`, { method: "GET" })).status).toBe(401);
      expect(await identity.currentSession()).toEqual(ok(undefined));
    }));

  it("l'ancien cookie, rejoué après la déconnexion, ne donne plus accès à /v1", () =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      await signUp(app, ip);
      const browser = makeApiBrowser(app, { ip });
      const signedIn = await browser(`${BASE_URL}/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: ADA.email, password: ADA.password }),
      });
      const oldCookie = cookieOf(signedIn);
      const replayOldCookie = () =>
        app.request(`${BASE_URL}/v1/spaces`, {
          headers: { cookie: oldCookie, "x-forwarded-for": ip },
        });
      expect((await replayOldCookie()).status).toBe(200);

      expect(await createIdentity({ apiUrl: BASE_URL, fetch: browser }).signOut()).toEqual(
        ok(undefined),
      );

      expect((await replayOldCookie()).status).toBe(401);
    }));

  it("sans session, la déconnexion réussit", () =>
    withIdentityApp(async (app) => {
      expect(await identityIn(app, makeClientIp()).signOut()).toEqual(ok(undefined));
    }));
});
