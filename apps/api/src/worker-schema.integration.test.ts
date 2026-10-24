import { describe, expect, it } from "vitest";

import { migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { createWorker } from "./worker.ts";

const SCHEMA_BEHIND = new Error("Schéma en retard : la migration 0042_x n'est pas appliquée.");

const makeBindings = (databaseUrl: string) => ({
  HYPERDRIVE: { connectionString: databaseUrl },
  BETTER_AUTH_SECRET: "secret-de-test-de-32-caracteres-au-moins",
  BETTER_AUTH_URL: "https://api.dezyn.dev",
  WEB_URL: "https://dezyn.dev",
});

const withRequests = async (
  run: (send: (worker: ReturnType<typeof createWorker>) => Promise<number>) => Promise<void>,
  databaseUrl: string,
) => {
  const closing: Promise<unknown>[] = [];
  const send = async (worker: ReturnType<typeof createWorker>) => {
    const response = await worker.fetch(
      new Request("https://api.dezyn.dev/health"),
      makeBindings(databaseUrl),
      { waitUntil: (promise) => closing.push(promise) },
    );
    return response.status;
  };
  try {
    await run(send);
  } finally {
    await Promise.all(closing);
  }
};

describe("le Worker vérifie le schéma une fois par isolat", () => {
  it("vérifie le schéma sur la base de Hyperdrive à la première requête, puis plus du tout", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });
      const checked: string[] = [];
      const worker = createWorker({
        log: () => undefined,
        assertSchema: async (databaseUrl) => {
          checked.push(databaseUrl);
        },
      });

      await withRequests(async (send) => {
        expect([await send(worker), await send(worker)]).toEqual([200, 200]);
      }, appUrl);

      expect(checked).toEqual([appUrl]);
    }));

  it("refait la vérification à la requête suivante quand elle a échoué", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });
      const outcomes = [SCHEMA_BEHIND, undefined];
      const worker = createWorker({
        log: () => undefined,
        assertSchema: async () => {
          const outcome = outcomes.shift();
          if (outcome !== undefined) {
            throw outcome;
          }
        },
      });

      await withRequests(async (send) => {
        expect([await send(worker), await send(worker)]).toEqual([503, 200]);
      }, appUrl);
    }));

  it("refuse de servir sur un schéma réellement en retard", () =>
    withThrowawayDatabase(async ({ appUrl }) => {
      const worker = (await import("./worker.ts")).default;

      await withRequests(async (send) => {
        expect(await send(worker)).toBe(503);
      }, appUrl);
    }));
});
