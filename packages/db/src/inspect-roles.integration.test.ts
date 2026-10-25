import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { inspectRoles } from "./inspect-roles.ts";
import { migrate } from "./migrate.ts";
import { asAdminOn, onClient, urlOf } from "./testing/clients.ts";
import { withThrowawayDatabase } from "./testing/throwaway-database.ts";

const ROLES = ["migrator", "app", "history_maintainer"];

const seedUser = (connectionString: string) =>
  onClient(connectionString, (client) =>
    client.query('INSERT INTO "identity_user" ("id", "name", "email") VALUES ($1, $2, $3)', [
      randomUUID(),
      "Ada Lovelace",
      "ada@dezyn.test",
    ]),
  );

describe("inspectRoles", () => {
  it("décrit une base saine : aucun rôle privilégié, tout à migrator, l'historique en ajout seul", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });
      await seedUser(appUrl);

      const report = await inspectRoles({ connectionString: migratorUrl, roles: ROLES });

      expect(report.privileged).toEqual([]);
      expect(report.foreign).toEqual([]);
      expect(report.history).toEqual(["INSERT"]);
      expect(report.rows["public.identity_user"]).toBe(1);
      expect(report.rows["public.space"]).toBe(0);
      expect(report.rows["drizzle.__drizzle_migrations"]).toBeGreaterThan(0);
    }));

  it("nomme les rôles privilégiés", () =>
    withThrowawayDatabase(async ({ migratorUrl }) => {
      await migrate({ connectionString: migratorUrl });
      const superuser = urlOf("DATABASE_URL_ADMIN").username;

      const report = await inspectRoles({
        connectionString: migratorUrl,
        roles: [...ROLES, superuser],
      });

      expect(report.privileged).toEqual([superuser]);
    }));

  it("nomme les objets de public et de drizzle qui n'appartiennent pas à migrator", () =>
    withThrowawayDatabase(async ({ migratorUrl }) => {
      await migrate({ connectionString: migratorUrl });
      await asAdminOn(migratorUrl, "CREATE SEQUENCE public.hors_de_portee");
      await asAdminOn(migratorUrl, "CREATE SEQUENCE drizzle.hors_de_portee");
      await asAdminOn(migratorUrl, "CREATE SCHEMA ailleurs");
      await asAdminOn(migratorUrl, "CREATE SEQUENCE ailleurs.hors_de_portee");

      const report = await inspectRoles({ connectionString: migratorUrl, roles: ROLES });

      expect(report.foreign).toEqual(["drizzle.hors_de_portee", "public.hors_de_portee"]);
    }));
});
