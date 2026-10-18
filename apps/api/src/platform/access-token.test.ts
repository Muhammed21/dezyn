import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity, VerificationFailure } from "@repo/auth-verifier";
import { err, ok, type Result } from "@repo/result";

import { type AuthenticatedEnv, requireAccessToken } from "./access-token.ts";

const RESOURCE_METADATA = "http://127.0.0.1:3000/.well-known/oauth-protected-resource/v1";

const makeIdentity = (overrides: Partial<AccessTokenIdentity> = {}): AccessTokenIdentity => ({
  userId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  sid: "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e",
  clientId: "client-claude-code",
  scopes: ["offline_access"],
  ...overrides,
});

const makeProtectedApp = (
  verification: Result<AccessTokenIdentity, VerificationFailure> = ok(makeIdentity()),
) => {
  const tokens: string[] = [];
  const app = new Hono<AuthenticatedEnv>()
    .use(
      requireAccessToken({
        verifyAccessToken: (token) => {
          tokens.push(token);
          return Promise.resolve(verification);
        },
        resourceMetadataUrl: RESOURCE_METADATA,
      }),
    )
    .get("/protege", (c) => c.json(c.get("identity")));
  return { app, tokens };
};

const callWith = (app: Hono<AuthenticatedEnv>, authorization?: string) =>
  app.request("/protege", {
    headers: authorization === undefined ? {} : { authorization },
  });

describe("requireAccessToken : une route protégée par jeton d'accès", () => {
  it("passe à la route l'identité du jeton vérifié", async () => {
    const identity = makeIdentity({ clientId: "client-chatgpt" });
    const { app, tokens } = makeProtectedApp(ok(identity));

    const response = await callWith(app, "Bearer jeton-signe");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(identity);
    expect(tokens).toEqual(["jeton-signe"]);
  });

  it("lit le schéma Bearer sans tenir compte de la casse", async () => {
    const { app, tokens } = makeProtectedApp();

    const response = await callWith(app, "bearer jeton-signe");

    expect(response.status).toBe(200);
    expect(tokens).toEqual(["jeton-signe"]);
  });

  it.each([
    ["sans en-tête", undefined],
    ["avec un autre schéma", "Token jeton-signe"],
    ["avec du texte après le jeton", "Bearer jeton-signe en-trop"],
    ["avec du texte avant Bearer", "xBearer jeton-signe"],
  ])(
    "%s, répond 401 avec les métadonnées de ressource, sans appeler le vérificateur",
    async (_case, authorization) => {
      const { app, tokens } = makeProtectedApp();

      const response = await callWith(app, authorization);

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        `Bearer resource_metadata="${RESOURCE_METADATA}"`,
      );
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Non authentifié",
        status: 401,
      });
      expect(tokens).toEqual([]);
    },
  );

  it.each([["invalid_token" as const], ["revoked" as const]])(
    "un refus %s répond 401 invalid_token",
    async (failure) => {
      const { app } = makeProtectedApp(err(failure));

      const response = await callWith(app, "Bearer jeton-signe");

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        `Bearer error="invalid_token", resource_metadata="${RESOURCE_METADATA}"`,
      );
    },
  );

  it("des sessions illisibles répondent 503 problem+json, sans demander de réauthentification", async () => {
    const { app } = makeProtectedApp(err("unavailable"));

    const response = await callWith(app, "Bearer jeton-signe");

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(response.headers.get("www-authenticate")).toBeNull();
    expect(await response.json()).toMatchObject({
      type: "about:blank",
      title: "Service indisponible",
      status: 503,
    });
  });
});
