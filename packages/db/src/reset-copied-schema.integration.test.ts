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

const urlOf = (variable: string): URL => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return new URL(url);
};

const asAdmin = (sql: string) =>
  onClient(urlOf("DATABASE_URL_ADMIN").toString(), (client) => client.query(sql));

const withDatabaseOwnedByAnotherRole = async (
  run: (urls: { readonly ownerUrl: string; readonly migratorUrl: string }) => Promise<void>,
): Promise<void> => {
  const name = `dezyn_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const password = randomUUID();
  await asAdmin(`CREATE ROLE ${name} LOGIN PASSWORD '${password}'`);
  await asAdmin(`CREATE DATABASE ${name} OWNER ${name}`);
  const ownerUrl = urlOf("DATABASE_URL_ADMIN");
  ownerUrl.username = name;
  ownerUrl.password = password;
  ownerUrl.pathname = `/${name}`;
  const migratorUrl = urlOf("DATABASE_URL_MIGRATOR");
  migratorUrl.pathname = `/${name}`;
  try {
    await run({ ownerUrl: ownerUrl.toString(), migratorUrl: migratorUrl.toString() });
  } finally {
    await asAdmin(`DROP DATABASE ${name} WITH (FORCE)`);
    await asAdmin(`DROP ROLE ${name}`);
  }
};

describe("resetCopiedSchema", () => {
  it("donne à migrator de quoi migrer une base qu'il ne possède pas", () =>
    withDatabaseOwnedByAnotherRole(async ({ ownerUrl, migratorUrl }) => {
      expect(await resetCopiedSchema({ connectionString: ownerUrl })).toEqual({ kind: "reset" });

      await migrate({ connectionString: migratorUrl });

      expect(await appliedMigrations(migratorUrl)).toBeGreaterThan(0);
    }));

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
