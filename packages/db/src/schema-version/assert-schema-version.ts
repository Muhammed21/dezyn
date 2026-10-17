import { Client } from "pg";

import type { Migration } from "./latest-migration.ts";

const isApplied = async (client: Client, migration: Migration): Promise<boolean> => {
  const { rows } = await client.query<{ table: string | null }>(
    "SELECT to_regclass('drizzle.__drizzle_migrations') AS table",
  );
  if (rows[0]?.table == null) {
    return false;
  }
  const { rowCount } = await client.query(
    "SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = $1",
    [migration.when],
  );
  return rowCount !== 0;
};

export const assertSchemaVersion = async ({
  connectionString,
  migration,
}: {
  readonly connectionString: string;
  readonly migration: Migration;
}): Promise<void> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    if (!(await isApplied(client, migration))) {
      throw new Error(
        `Schéma en retard : la migration ${migration.tag} n'est pas appliquée. Lancer la migration avant l'application.`,
      );
    }
  } finally {
    await client.end();
  }
};
