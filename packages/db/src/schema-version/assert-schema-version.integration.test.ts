import { describe, expect, it } from "vitest";

import { LATEST_MIGRATION } from "../generated/latest-migration.ts";
import { migrate } from "../migrate.ts";
import { withThrowawayDatabase } from "../testing/throwaway-database.ts";
import { assertSchemaVersion } from "./assert-schema-version.ts";

const SOCLE = { tag: "0000_socle", when: 1_792_275_091_327 };

describe("assertSchemaVersion", () => {
  it("refuse une base vide en nommant la migration attendue", () =>
    withThrowawayDatabase(async ({ appUrl }) => {
      await expect(
        assertSchemaVersion({ connectionString: appUrl, migration: SOCLE }),
      ).rejects.toThrow("Schéma en retard : la migration 0000_socle n'est pas appliquée");
    }));

  it("accepte une base migrée par migrator, lue avec le rôle app", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });

      await expect(
        assertSchemaVersion({ connectionString: appUrl, migration: LATEST_MIGRATION }),
      ).resolves.toBeUndefined();
    }));

  it("refuse une base en retard d'une migration, en la nommant", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });
      const upcoming = { tag: "0001_a_venir", when: LATEST_MIGRATION.when + 1 };

      await expect(
        assertSchemaVersion({ connectionString: appUrl, migration: upcoming }),
      ).rejects.toThrow("Schéma en retard : la migration 0001_a_venir n'est pas appliquée");
    }));
});
