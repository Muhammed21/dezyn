import { describe, expect, it } from "vitest";

import { createPostgresDatabase } from "#db";
import type { LogRecord } from "#platform/logging.ts";
import {
  ADA,
  type App,
  BASE_URL,
  GRACE,
  obtainAccessToken,
  WEB_URL,
} from "#testing/authorization-flow.ts";
import { invite, personalSpaceOf, switchToTeam } from "#testing/space-fixtures.ts";
import { migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { createWorker } from "./worker.ts";

const workerApp = (worker: ReturnType<typeof createWorker>, databaseUrl: string): App => ({
  request: (input, init) =>
    worker.fetch(
      new Request(input, init),
      {
        HYPERDRIVE: { connectionString: databaseUrl },
        BETTER_AUTH_SECRET: "secret-de-test-de-32-caracteres-au-moins",
        BETTER_AUTH_URL: BASE_URL,
        WEB_URL,
        TRUSTED_IP_HEADER: "x-forwarded-for",
      },
      { waitUntil: () => undefined },
    ),
});

describe("le Worker de production n'envoie pas encore d'email", () => {
  it("une invitation répond 503, et l'email est journalisé sans son lien", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });
      const logged: LogRecord[] = [];
      const app = workerApp(
        createWorker({ log: (record) => logged.push(record), assertSchema: async () => undefined }),
        appUrl,
      );
      const db = createPostgresDatabase({ url: appUrl });
      try {
        const { accessToken, userId } = await obtainAccessToken(app);
        const spaceId = await personalSpaceOf(db, userId);
        await switchToTeam(db, spaceId);

        const response = await invite(app, { accessToken, spaceId });

        expect(response.status).toBe(503);
        expect(logged).toContainEqual({
          level: "warn",
          msg: "email not sent",
          to: GRACE.email,
          subject: `Invitation à rejoindre « ${ADA.name} » sur dezyn`,
        });
        expect(JSON.stringify(logged)).not.toContain("/invitations/");
      } finally {
        await db.close();
      }
    }));
});
