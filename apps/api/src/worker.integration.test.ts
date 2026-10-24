import { describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";

import { migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

const HYPERDRIVE_LOCAL = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";

const withWorker = async (
  databaseUrl: string,
  run: (worker: ReturnType<typeof createTestHarness>) => Promise<void>,
) => {
  process.env[HYPERDRIVE_LOCAL] = databaseUrl;
  const worker = createTestHarness({
    root: new URL("..", import.meta.url).pathname,
    workers: [
      {
        configPath: "./wrangler.jsonc",
        secrets: { BETTER_AUTH_SECRET: "secret-de-test-de-32-caracteres-au-moins" },
      },
    ],
  });
  try {
    await worker.listen();
    await run(worker);
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
          const response = await worker.fetch("/health");

          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({ status: "ok" });
        });
      }),
    60_000,
  );
});
