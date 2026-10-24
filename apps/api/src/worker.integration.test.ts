import { describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";

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

const withWorker = async (databaseUrl: string, run: (worker: App) => Promise<void>) => {
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
    await run(httpApp(url));
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
});
