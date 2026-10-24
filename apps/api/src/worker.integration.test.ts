import { describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";

import { REGISTRATION_RATE_LIMIT } from "#modules/identity/infrastructure/better-auth.ts";
import {
  ADA,
  type App,
  BASE_URL,
  callMcp,
  obtainAccessToken,
  WEB_URL,
} from "#testing/authorization-flow.ts";
import { httpApp } from "#testing/http-app.ts";
import { migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

const HYPERDRIVE_LOCAL = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";

const register = async (worker: App, ip: string) =>
  worker.request(`${BASE_URL}/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({
      client_name: "Claude Code",
      redirect_uris: ["http://localhost:33418/callback"],
      token_endpoint_auth_method: "none",
    }),
  });

const jsonLines = (messages: readonly string[]): readonly unknown[] =>
  messages.flatMap((message) => {
    try {
      return [JSON.parse(message)];
    } catch {
      return [];
    }
  });

const withWorker = async (
  databaseUrl: string,
  run: (worker: App, logs: () => readonly string[]) => Promise<void>,
) => {
  process.env[HYPERDRIVE_LOCAL] = databaseUrl;
  const worker = createTestHarness({
    root: new URL("..", import.meta.url).pathname,
    workers: [
      {
        configPath: "./wrangler.jsonc",
        vars: { BETTER_AUTH_URL: BASE_URL, WEB_URL, TRUSTED_IP_HEADER: "x-forwarded-for" },
        secrets: { BETTER_AUTH_SECRET: "secret-de-test-de-32-caracteres-au-moins" },
      },
    ],
  });
  try {
    const { url } = await worker.listen();
    await run(httpApp(url), () => worker.getLogs().map(({ message }) => message));
  } finally {
    await worker.close();
    delete process.env[HYPERDRIVE_LOCAL];
  }
};

describe("le Worker de production", () => {
  it(
    "répond à la sonde de santé sur un schéma à jour",
    () =>
      withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
        await migrate({ connectionString: migratorUrl });

        await withWorker(appUrl, async (worker) => {
          const response = await worker.request(`${BASE_URL}/health`);

          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({ status: "ok" });
        });
      }),
    60_000,
  );

  it(
    "sert une autorisation OAuth complète, puis le MCP et l'API avec le jeton obtenu",
    () =>
      withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
        await migrate({ connectionString: migratorUrl });

        await withWorker(appUrl, async (worker) => {
          const { accessToken } = await obtainAccessToken(worker);

          const tools = await callMcp(worker, { token: accessToken, method: "tools/list" });
          const spaces = await worker.request(`${BASE_URL}/v1/spaces`, {
            headers: { authorization: `Bearer ${accessToken}` },
          });

          expect(tools.status).toBe(200);
          expect(await tools.json()).toMatchObject({
            result: {
              tools: expect.arrayContaining([expect.objectContaining({ name: "whoami" })]),
            },
          });
          expect(spaces.status).toBe(200);
          expect(await spaces.json()).toMatchObject({
            spaces: [{ name: ADA.name, plan: "free", role: "owner" }],
          });
        });
      }),
    60_000,
  );

  it(
    "écrit chaque requête en ligne JSON, sans signaler de coupure quand la base se ferme",
    () =>
      withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
        await migrate({ connectionString: migratorUrl });

        await withWorker(appUrl, async (worker, logs) => {
          await worker.request(`${BASE_URL}/health`, {
            headers: { "x-correlation-id": "ci-worker-1" },
          });
          await worker.request(`${BASE_URL}/health`);

          expect(jsonLines(logs())).toContainEqual({
            time: expect.any(String),
            level: "info",
            msg: "request",
            method: "GET",
            path: "/health",
            status: 200,
            durationMs: expect.any(Number),
            correlationId: "ci-worker-1",
          });
          expect(logs().join("\n")).not.toContain("connection lost");
          expect(logs().filter((message) => message.endsWith("\n"))).toEqual([]);
        });
      }),
    60_000,
  );

  it(
    "deux Workers sur la même base partagent la limite d'enregistrement OAuth d'une IP",
    () =>
      withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
        await migrate({ connectionString: migratorUrl });

        await withWorker(appUrl, (first) =>
          withWorker(appUrl, async (second) => {
            const allowed = await Promise.all(
              Array.from({ length: REGISTRATION_RATE_LIMIT.max }, (_, index) =>
                register(index % 2 === 0 ? first : second, "203.0.113.8"),
              ),
            );

            const refusedByFirst = await register(first, "203.0.113.8");
            const refusedBySecond = await register(second, "203.0.113.8");
            const otherIp = await register(second, "203.0.113.9");

            expect(allowed.map((response) => response.status)).toEqual(
              Array(REGISTRATION_RATE_LIMIT.max).fill(201),
            );
            expect(refusedByFirst.status).toBe(429);
            expect(refusedBySecond.status).toBe(429);
            expect(otherIp.status).toBe(201);
          }),
        );
      }),
    90_000,
  );
});
