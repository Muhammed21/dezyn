import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { createThrowawayDatabase } from "@repo/db/testing";

import { startIdentityApp } from "./authorization-flow.ts";

const databaseExists = async (name: string) => {
  const client = new Client({ connectionString: process.env.DATABASE_URL_MIGRATOR });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    return rowCount === 1;
  } finally {
    await client.end();
  }
};

describe("l'app de test démarre sur une base jetable", () => {
  it("un démarrage qui échoue ne laisse pas sa base derrière lui", async () => {
    const created: string[] = [];

    await expect(
      startIdentityApp({
        createDatabase: async () => {
          const database = await createThrowawayDatabase();
          created.push(new URL(database.migratorUrl).pathname.slice(1));
          return database;
        },
        wrapUserCreated: () => {
          throw new Error("démarrage interrompu");
        },
      }),
    ).rejects.toThrow("démarrage interrompu");

    expect(created).toHaveLength(1);
    expect(await databaseExists(created[0] ?? "")).toBe(false);
  });
});
