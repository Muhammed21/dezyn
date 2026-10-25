import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { migrate } from "./migrate.ts";
import { resetCopiedSchema } from "./reset-copied-schema.ts";
import { withThrowawayDatabase } from "./testing/throwaway-database.ts";

const onClient = async <T>(connectionString: string, run: (client: Client) => Promise<T>) => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

const appliedMigrations = (connectionString: string) =>
  onClient(connectionString, async (client) => {
    const { rows } = await client.query<{ count: string }>(
      "SELECT count(*) FROM drizzle.__drizzle_migrations",
    );
    return Number(rows[0]?.count);
  });

const copySchemaWithoutRows = (connectionString: string) =>
  onClient(connectionString, async (client) => {
    await client.query("DELETE FROM drizzle.__drizzle_migrations");
  });

const seedUser = (connectionString: string) =>
  onClient(connectionString, async (client) => {
    await client.query('INSERT INTO "identity_user" ("id", "name", "email") VALUES ($1, $2, $3)', [
      randomUUID(),
      "Ada Lovelace",
      "ada@dezyn.test",
    ]);
  });

describe("resetCopiedSchema", () => {
  it("vide un schéma copié sans lignes, et la migration repasse ensuite", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });
      await copySchemaWithoutRows(migratorUrl);

      expect(await resetCopiedSchema({ connectionString: migratorUrl })).toEqual({ kind: "reset" });
      await migrate({ connectionString: migratorUrl });

      const users = await onClient(appUrl, (client) =>
        client.query('SELECT * FROM "identity_user"'),
      );
      expect(users.rows).toEqual([]);
    }));

  it("refuse une base dont le journal des migrations a des lignes, sans rien y changer", () =>
    withThrowawayDatabase(async ({ migratorUrl }) => {
      await migrate({ connectionString: migratorUrl });
      const before = await appliedMigrations(migratorUrl);

      expect(await resetCopiedSchema({ connectionString: migratorUrl })).toEqual({
        kind: "refused",
        tables: ["drizzle.__drizzle_migrations"],
      });
      expect(await appliedMigrations(migratorUrl)).toBe(before);
    }));

  it("refuse une base dont une table de public a des lignes", () =>
    withThrowawayDatabase(async ({ migratorUrl }) => {
      await migrate({ connectionString: migratorUrl });
      await copySchemaWithoutRows(migratorUrl);
      await seedUser(migratorUrl);

      expect(await resetCopiedSchema({ connectionString: migratorUrl })).toEqual({
        kind: "refused",
        tables: ["public.identity_user"],
      });
    }));
});
