import { Client } from "pg";

type Table = { readonly schemaname: string; readonly tablename: string };

const qualified = (client: Client, { schemaname, tablename }: Table): string =>
  `${client.escapeIdentifier(schemaname)}.${client.escapeIdentifier(tablename)}`;

const tablesWithRows = async (client: Client): Promise<readonly string[]> => {
  const { rows: tables } = await client.query<Table>(
    "SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public', 'drizzle') ORDER BY schemaname, tablename",
  );
  const counted = await Promise.all(
    tables.map(async (table) => {
      const { rows } = await client.query<{ filled: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM ${qualified(client, table)}) AS filled`,
      );
      return { name: `${table.schemaname}.${table.tablename}`, filled: rows[0]?.filled === true };
    }),
  );
  return counted.filter(({ filled }) => filled).map(({ name }) => name);
};

export type ResetOutcome =
  | { readonly kind: "reset" }
  | { readonly kind: "refused"; readonly tables: readonly string[] };

export const resetCopiedSchema = async ({
  connectionString,
}: {
  readonly connectionString: string;
}): Promise<ResetOutcome> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const filled = await tablesWithRows(client);
    if (filled.length > 0) {
      return { kind: "refused", tables: filled };
    }
    await client.query(`
      BEGIN;
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT USAGE ON SCHEMA public TO PUBLIC;
      DO $$ BEGIN EXECUTE format('GRANT CREATE ON DATABASE %I TO migrator', current_database()); END $$;
      GRANT CREATE ON SCHEMA public TO migrator;
      COMMIT;
    `);
    return { kind: "reset" };
  } finally {
    await client.end();
  }
};
