import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { Database } from "./database.ts";
import { errorDetails, type LogSink } from "./logging.ts";

const CONNECTION_TIMEOUT_MS = 2_000;
const STATEMENT_TIMEOUT_MS = 2_000;
const LOCK_TIMEOUT_MS = 1_000;
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 5_000;

export type PostgresDatabase = Database & {
  readonly orm: NodePgDatabase;
  readonly close: () => Promise<void>;
};

export type PostgresTransaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

export const createPostgresDatabase = ({
  url,
  log = () => undefined,
}: {
  readonly url: string;
  readonly log?: LogSink;
}): PostgresDatabase => {
  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    lock_timeout: LOCK_TIMEOUT_MS,
    idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
  });
  const connectionLost = (error: Error) =>
    log({ level: "error", msg: "postgres connection lost", ...errorDetails(error) });
  pool.on("error", connectionLost);
  pool.on("connect", (client) => client.on("error", connectionLost));

  return {
    orm: drizzle(pool),
    ping: async () => {
      await pool.query("SELECT 1");
    },
    close: () => pool.end(),
  };
};
