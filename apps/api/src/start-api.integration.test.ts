import { describe, expect, it } from "vitest";

import { LATEST_MIGRATION, migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { startApi } from "./start-api.ts";

describe("startApi", () => {
  it("refuse de démarrer sur un schéma en retard, en nommant la migration manquante", () =>
    withThrowawayDatabase(async ({ appUrl }) => {
      await expect(
        startApi({ databaseUrl: appUrl, migration: LATEST_MIGRATION, port: 0 }),
      ).rejects.toThrow(
        `Schéma en retard : la migration ${LATEST_MIGRATION.tag} n'est pas appliquée`,
      );
    }));

  it("démarre sur un schéma à jour et répond à la sonde de santé", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });

      const api = await startApi({ databaseUrl: appUrl, migration: LATEST_MIGRATION, port: 0 });
      try {
        const response = await fetch(new URL("/health", api.url));

        expect(response.status).toBe(200);
      } finally {
        await api.close();
      }
    }));

  it("n'écoute plus une fois arrêtée", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });
      const api = await startApi({ databaseUrl: appUrl, migration: LATEST_MIGRATION, port: 0 });

      await api.close();

      await expect(fetch(new URL("/health", api.url))).rejects.toThrow("fetch failed");
    }));
});
