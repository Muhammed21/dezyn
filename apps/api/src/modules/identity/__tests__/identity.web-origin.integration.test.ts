import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  makeClientIp,
  signUp,
  WEB_URL,
  withIdentityApp,
} from "#testing/authorization-flow.ts";

const signInFrom = (app: App, { origin, ip }: { origin: string; ip: string }) =>
  app.request(`${BASE_URL}/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": ip },
    body: JSON.stringify({ email: ADA.email, password: ADA.password }),
  });

describe("identité : connexion depuis l'app web (ADR 0044 §3)", () => {
  it("une connexion depuis l'origine de WEB_URL ouvre une session, avec les en-têtes CORS", () =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      await signUp(app, ip);

      const response = await signInFrom(app, { origin: WEB_URL, ip });

      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie().join(";")).toMatch(/better-auth\.session_token=/);
      expect(response.headers.get("access-control-allow-origin")).toBe(WEB_URL);
      expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    }));

  it("une connexion depuis une autre origine est refusée, sans session", () =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      await signUp(app, ip);

      const response = await signInFrom(app, { origin: "https://autre.dezyn.dev", ip });

      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toEqual([]);
    }));
});
