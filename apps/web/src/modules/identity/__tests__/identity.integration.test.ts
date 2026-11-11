import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  makeClientIp,
  signUp,
  withIdentityApp,
} from "@repo/api/testing/authorization-flow.ts";
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
