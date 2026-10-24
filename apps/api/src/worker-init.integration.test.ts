import { describe, expect, it } from "vitest";

import type { LogRecord } from "#platform/logging.ts";
import type { Fetch } from "#platform/resend-mailer.ts";
import { migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { createWorker } from "./worker.ts";

const noOutgoingCall: Fetch = () => Promise.reject(new Error("aucun appel sortant attendu"));

const SIMULTANEOUS_REQUESTS = 10;

describe("le Worker sur une base neuve", () => {
  it("des requêtes simultanées qui initialisent l'authentification répondent toutes", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });
      const logged: LogRecord[] = [];
      const worker = createWorker({
        log: (record) => logged.push(record),
        assertSchema: async () => undefined,
        fetch: noOutgoingCall,
      });
      const closing: Promise<unknown>[] = [];

      const statuses = await Promise.all(
        Array.from({ length: SIMULTANEOUS_REQUESTS }, async () => {
          const response = await worker.fetch(
            new Request("https://api.dezyn.dev/.well-known/oauth-authorization-server"),
            {
              HYPERDRIVE: { connectionString: appUrl },
              BETTER_AUTH_SECRET: "secret-de-test-de-32-caracteres-au-moins",
              BETTER_AUTH_URL: "https://api.dezyn.dev",
              WEB_URL: "https://dezyn.dev",
            },
            { waitUntil: (promise) => closing.push(promise) },
          );
          return response.status;
        }),
      );
      await Promise.all(closing);

      expect(statuses).toEqual(Array(SIMULTANEOUS_REQUESTS).fill(200));
      expect(logged.filter(({ level }) => level === "error")).toEqual([]);
    }));
});
