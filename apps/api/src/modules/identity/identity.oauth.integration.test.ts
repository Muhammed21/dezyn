import { describe, expect, it } from "vitest";

import { migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { createApp } from "../../create-app.ts";
import { createPostgresDatabase } from "../../platform/postgres-database.ts";
import { makeHistory, makeProjects, makeSpaces } from "../../testing/make-app.ts";
import { createIdentityAuth, REGISTRATION_RATE_LIMIT } from "./infrastructure/better-auth.ts";

const BASE_URL = "http://127.0.0.1:3000";
const CLIENT_IP_HEADER = "x-dezyn-client-ip";

const withIdentityApp = (run: (app: ReturnType<typeof createApp>) => Promise<void>) =>
  withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
    await migrate({ connectionString: migratorUrl });
    const db = createPostgresDatabase({ url: appUrl });
    try {
      const auth = await createIdentityAuth({
        db,
        secret: "secret-de-test-de-32-caracteres-au-moins",
        baseURL: BASE_URL,
        trustedIpHeader: CLIENT_IP_HEADER,
        log: () => undefined,
        onUserCreated: () => Promise.resolve(),
      });
      await run(
        createApp({
          db,
          auth,
          log: () => undefined,
          spaces: makeSpaces(),
          projects: makeProjects(),
          history: makeHistory(),
        }),
      );
    } finally {
      await db.close();
    }
  });

const getJson = async (app: ReturnType<typeof createApp>, path: string) => {
  const response = await app.request(`${BASE_URL}${path}`);
  expect(response.status).toBe(200);
  return response.json();
};

const register = async (app: ReturnType<typeof createApp>, ip: string) =>
  app.request(`${BASE_URL}/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json", [CLIENT_IP_HEADER]: ip },
    body: JSON.stringify({
      client_name: "Claude Code",
      redirect_uris: ["http://localhost:33418/callback"],
      token_endpoint_auth_method: "none",
    }),
  });

describe("découverte du serveur d'autorisation et enregistrement d'un client MCP", () => {
  it("l'auth n'est rendue qu'une fois prête : on peut fermer la base aussitôt", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });
      const db = createPostgresDatabase({ url: appUrl });

      await createIdentityAuth({
        db,
        secret: "secret-de-test-de-32-caracteres-au-moins",
        baseURL: BASE_URL,
        trustedIpHeader: CLIENT_IP_HEADER,
        log: () => undefined,
        onUserCreated: () => Promise.resolve(),
      });

      await expect(db.close()).resolves.toBeUndefined();
    }));

  it("les métadonnées de ressource protégée nomment la ressource /v1 et le serveur d'autorisation", () =>
    withIdentityApp(async (app) => {
      const resource = await getJson(app, "/.well-known/oauth-protected-resource");
      const server = await getJson(app, "/.well-known/oauth-authorization-server");

      expect(resource).toMatchObject({
        resource: `${BASE_URL}/v1`,
        bearer_methods_supported: ["header"],
        authorization_servers: [server.issuer],
      });
      expect(server).toMatchObject({ registration_endpoint: `${BASE_URL}/auth/oauth2/register` });
    }));

  it("le chemin propre à la ressource /v1 sert les mêmes métadonnées", () =>
    withIdentityApp(async (app) => {
      expect(await getJson(app, "/.well-known/oauth-protected-resource/v1")).toEqual(
        await getJson(app, "/.well-known/oauth-protected-resource"),
      );
    }));

  it("un enregistrement dynamique renvoie un client_id", () =>
    withIdentityApp(async (app) => {
      const response = await register(app, "203.0.113.7");

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        client_id: expect.any(String),
        client_name: "Claude Code",
      });
    }));

  it("au-delà de la limite, un nouvel enregistrement depuis la même IP répond 429", () =>
    withIdentityApp(async (app) => {
      const allowed = await Promise.all(
        Array.from({ length: REGISTRATION_RATE_LIMIT.max }, () => register(app, "203.0.113.8")),
      );

      const refused = await register(app, "203.0.113.8");
      const otherIp = await register(app, "203.0.113.9");

      expect(allowed.map((response) => response.status)).toEqual(
        Array(REGISTRATION_RATE_LIMIT.max).fill(201),
      );
      expect(refused.status).toBe(429);
      expect(otherIp.status).toBe(201);
    }));
});
