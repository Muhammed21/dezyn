import { describe, expect, it } from "vitest";

import type { AuthSecret } from "#platform/api-config.ts";
import {
  type App,
  obtainAccessToken,
  refreshTokens,
  startIdentityApp,
} from "#testing/authorization-flow.ts";
import { withThrowawayDatabase, type ThrowawayDatabase } from "@repo/db/testing";

const HISTORICAL_SECRET = "secret-historique-de-32-caracteres-au-moins";
const SECOND_SECRET = "deuxieme-secret-de-32-caracteres-au-moins";

const restartWith = async <T>(
  database: ThrowawayDatabase,
  secrets: readonly AuthSecret[],
  run: (app: App) => T | Promise<T>,
): Promise<T> => {
  const { app, close } = await startIdentityApp({
    createDatabase: async () => ({ ...database, drop: async () => undefined }),
    secret: HISTORICAL_SECRET,
    secrets,
  });
  try {
    return await run(app);
  } finally {
    await close();
  }
};

describe("rotation du secret d'authentification (#127)", () => {
  it("une nouvelle version du secret laisse l'API émettre des jetons avec la clé existante", () =>
    withThrowawayDatabase(async (database) => {
      const tokens = await restartWith(database, [], obtainAccessToken);

      const refreshed = await restartWith(database, [{ version: 2, value: SECOND_SECRET }], (app) =>
        refreshTokens(app, tokens),
      );

      expect(refreshed.status).toBe(200);
    }));

  it("la version la plus récente chiffre la clé créée après la rotation", () =>
    withThrowawayDatabase(async (database) => {
      const tokens = await restartWith(
        database,
        [{ version: 2, value: SECOND_SECRET }],
        obtainAccessToken,
      );

      const refreshed = await restartWith(database, [], (app) => refreshTokens(app, tokens));

      expect(refreshed.status).toBe(500);
    }));
});
