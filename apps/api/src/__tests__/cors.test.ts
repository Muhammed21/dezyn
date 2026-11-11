import { describe, expect, it } from "vitest";

import { makeApp, makeAuth } from "#testing/make-app.ts";
import { ok } from "@repo/result";

const WEB_ORIGIN = "https://dezyn.dev";
const API = "https://api.dezyn.dev";
const SESSION_COOKIE = "better-auth.session_token=session-de-ada";

const connectedApp = (webUrl = `${WEB_ORIGIN}/`) =>
  makeApp({
    webUrl,
    auth: makeAuth({
      sessionOf: () => Promise.resolve(ok({ userId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b" })),
    }),
  }).app;

const preflight = (app: ReturnType<typeof connectedApp>, origin: string, path = "/v1/spaces") =>
  app.request(`${API}${path}`, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type, x-en-tete-inconnu",
    },
  });

const corsHeadersOf = (response: Response) =>
  [...response.headers.keys()].filter((name) => name.startsWith("access-control-"));

describe("CORS de l'app web (ADR 0044 §3)", () => {
  it.each(["/v1/spaces", "/auth/sign-in/email"])(
    "un préflight vers %s depuis l'origine de WEB_URL est accepté sans session",
    async (path) => {
      const app = makeApp({ webUrl: `${WEB_ORIGIN}/` }).app;

      const response = await preflight(app, WEB_ORIGIN, path);

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
      expect(response.headers.get("access-control-allow-credentials")).toBe("true");
      expect(response.headers.get("access-control-allow-methods")).toBe(
        "GET,HEAD,POST,PATCH,DELETE",
      );
      expect(response.headers.get("access-control-allow-headers")).toBe("content-type");
    },
  );

  it("une lecture par cookie depuis l'origine de WEB_URL porte les en-têtes CORS", async () => {
    const app = connectedApp();

    const response = await app.request(`${API}/v1/spaces`, {
      headers: { origin: WEB_ORIGIN, cookie: SESSION_COOKIE },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ spaces: [] });
    expect(response.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("WEB_URL écrite avec un chemin reconnaît son origine", async () => {
    const app = connectedApp(`${WEB_ORIGIN}/app/espaces`);

    const response = await preflight(app, WEB_ORIGIN);

    expect(response.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
  });

  it.each([
    ["un autre sous-domaine", "https://autre.dezyn.dev"],
    ["un autre schéma", "http://dezyn.dev"],
    ["un autre port", "https://dezyn.dev:8443"],
    ["une origine qui commence par celle de WEB_URL", "https://dezyn.dev.attaquant.test"],
    ["l'origine de l'API", API],
  ])("%s ne reçoit aucun en-tête CORS", async (_case, origin) => {
    const app = connectedApp();

    const preflighted = await preflight(app, origin);
    const read = await app.request(`${API}/v1/spaces`, {
      headers: { origin, cookie: SESSION_COOKIE },
    });

    expect(corsHeadersOf(preflighted)).toEqual([]);
    expect(corsHeadersOf(read)).toEqual([]);
  });

  it("une requête sans Origin, comme celle d'une IA ou d'un outil, ne reçoit aucun en-tête CORS", async () => {
    const app = connectedApp();

    const response = await app.request(`${API}/v1/spaces`, {
      headers: { cookie: SESSION_COOKIE },
    });

    expect(response.status).toBe(200);
    expect(corsHeadersOf(response)).toEqual([]);
  });

  it("le CORS ne s'étend pas aux autres routes de l'API", async () => {
    const app = connectedApp();

    const response = await app.request(`${API}/health`, { headers: { origin: WEB_ORIGIN } });

    expect(corsHeadersOf(response)).toEqual([]);
  });
});
