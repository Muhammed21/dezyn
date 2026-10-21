import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { startIdentityApp } from "./authorization-flow.ts";

const throwawayDatabases = async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL_MIGRATOR });
  await client.connect();
  try {
    const { rows } = await client.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE datname LIKE 'dezyn_test_%'",
    );
    return rows.map(({ datname }) => datname);
  } finally {
    await client.end();
  }
};

describe("l'app de test démarre sur une base jetable", () => {
  it("un démarrage qui échoue ne laisse pas sa base derrière lui", async () => {
    const before = await throwawayDatabases();

    await expect(
      startIdentityApp({
        wrapUserCreated: () => {
          throw new Error("démarrage interrompu");
        },
      }),
    ).rejects.toThrow("démarrage interrompu");

    expect(await throwawayDatabases()).toEqual(before);
  });
});
