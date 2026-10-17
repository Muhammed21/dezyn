import { Pool } from "pg";

import type { Database } from "./database.ts";

const CONNECTION_TIMEOUT_MS = 2_000;

export type PostgresDatabase = Database & {
  readonly close: () => Promise<void>;
};

export const createPostgresDatabase = ({ url }: { readonly url: string }): PostgresDatabase => {
  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  return {
    ping: async () => {
      await pool.query("SELECT 1");
    },
    close: () => pool.end(),
  };
};
