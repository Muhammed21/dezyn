import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import type { AuthSecret } from "#platform/api-config.ts";
import type { LogRecord, LogSink } from "#platform/logging.ts";
import {
  type App,
  callMcp,
  obtainAccessToken,
  refreshTokens,
  startIdentityApp,
} from "#testing/authorization-flow.ts";
import { expireSigningKeys, schema } from "@repo/db";
import { withThrowawayDatabase, type ThrowawayDatabase } from "@repo/db/testing";

const HISTORICAL_SECRET = "secret-historique-de-32-caracteres-au-moins";
const SECOND_SECRET = "deuxieme-secret-de-32-caracteres-au-moins";
const THIRD_SECRET = "troisieme-secret-de-32-caracteres-au-moins";
const SECOND = { version: 2, value: SECOND_SECRET };
const THIRD = { version: 3, value: THIRD_SECRET };

const restartWith = async <T>(
  database: ThrowawayDatabase,
  secrets: readonly AuthSecret[],
  run: (app: App, db: PostgresDatabase) => T | Promise<T>,
  authLog?: LogSink,
): Promise<T> => {
  const { app, db, close } = await startIdentityApp({
    createDatabase: async () => ({ ...database, drop: async () => undefined }),
    secret: HISTORICAL_SECRET,
    secrets,
    authLog,
  });
  try {
    return await run(app, db);
  } finally {
    await close();
  }
};

describe("rotation du secret d'authentification (#127)", () => {
  it("une nouvelle version du secret laisse l'API émettre des jetons avec la clé existante", () =>
    withThrowawayDatabase(async (database) => {
      const tokens = await restartWith(database, [], (app) => obtainAccessToken(app));

      const refreshed = await restartWith(database, [{ version: 2, value: SECOND_SECRET }], (app) =>
        refreshTokens(app, tokens),
      );

      expect(refreshed.status).toBe(200);
    }));

  it("la version la plus récente chiffre la clé créée après la rotation", () =>
    withThrowawayDatabase(async (database) => {
      const tokens = await restartWith(database, [{ version: 2, value: SECOND_SECRET }], (app) =>
        obtainAccessToken(app),
      );

      const refreshed = await restartWith(database, [], (app) => refreshTokens(app, tokens));

      expect(refreshed.status).toBe(500);
    }));

  it("/health crée la clé de signature d'une base qui n'en a pas", () =>
    withThrowawayDatabase(async (database) => {
      const { status, keys } = await restartWith(database, [], async (app, db) => ({
        status: (await app.request("/health")).status,
        keys: await db.orm.select().from(schema.identityJwks),
      }));

      expect(status).toBe(200);
      expect(keys).toHaveLength(1);
    }));

  it("/health répond 200 quand une version du secret déchiffre la clé", () =>
    withThrowawayDatabase(async (database) => {
      const versions = [{ version: 2, value: SECOND_SECRET }];
      await restartWith(database, versions, (app) => app.request("/health"));

      const health = await restartWith(database, versions, (app) => app.request("/health"));

      expect(health.status).toBe(200);
    }));

  it("/health répond 503 quand aucun secret ne déchiffre la clé", () =>
    withThrowawayDatabase(async (database) => {
      await restartWith(database, [{ version: 2, value: SECOND_SECRET }], (app) =>
        app.request("/health"),
      );

      const health = await restartWith(database, [], (app) => app.request("/health"));

      expect(health.status).toBe(503);
    }));

  it("le contrôle de la clé journalise la cause de son échec", () =>
    withThrowawayDatabase(async (database) => {
      await restartWith(database, [{ version: 2, value: SECOND_SECRET }], (app) =>
        app.request("/health"),
      );
      const records: LogRecord[] = [];

      await restartWith(
        database,
        [],
        (app) => app.request("/health"),
        (record) => records.push(record),
      );

      expect(records).toContainEqual(
        expect.objectContaining({
          level: "error",
          msg: "signing key check failed",
          error: expect.stringContaining("Failed to decrypt private key"),
        }),
      );
    }));
});

describe("une rotation termine aussitôt en expirant les clés valides (#156)", () => {
  it("après l'expiration des clés, /health crée une clé que l'API sans l'ancienne version déchiffre", () =>
    withThrowawayDatabase(async (database) => {
      const tokens = await restartWith(database, [SECOND], (app) => obtainAccessToken(app));

      await expireSigningKeys({ connectionString: database.migratorUrl, now: new Date() });
      const health = await restartWith(database, [THIRD, SECOND], (app) => app.request("/health"));
      const refreshed = await restartWith(database, [THIRD], (app) => refreshTokens(app, tokens));

      expect(health.status).toBe(200);
      expect(refreshed.status).toBe(200);
    }));

  it("un jeton d'accès signé par une clé expirée reste accepté pendant le délai de grâce", () =>
    withThrowawayDatabase(async (database) => {
      const { accessToken } = await restartWith(database, [SECOND], (app) =>
        obtainAccessToken(app),
      );

      await expireSigningKeys({ connectionString: database.migratorUrl, now: new Date() });
      const response = await restartWith(database, [THIRD, SECOND], async (app) => {
        await app.request("/health");
        return callMcp(app, {
          token: accessToken,
          method: "tools/call",
          params: { name: "whoami", arguments: {} },
        });
      });

      expect(response.status).toBe(200);
    }));
});
