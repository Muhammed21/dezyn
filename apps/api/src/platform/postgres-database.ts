import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { Database } from "./database.ts";

const CONNECTION_TIMEOUT_MS = 2_000;

export type PostgresDatabase = Database & {
  readonly orm: NodePgDatabase;
  readonly close: () => Promise<void>;
};

export type PostgresTransaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

export const createPostgresDatabase = ({ url }: { readonly url: string }): PostgresDatabase => {
  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  return {
    orm: drizzle(pool),
    ping: async () => {
      await pool.query("SELECT 1");
    },
    close: () => pool.end(),
  };
};
