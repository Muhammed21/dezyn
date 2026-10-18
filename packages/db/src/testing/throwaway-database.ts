import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { Client } from "pg";

const urlOf = (variable: string): URL => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return new URL(url);
};

const onDatabase = (url: URL, database: string): string => {
  const copy = new URL(url);
  copy.pathname = `/${database}`;
  return copy.toString();
};

const asMigrator = async (run: (client: Client) => Promise<void>) => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR").toString() });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
};

const DROP_TIMEOUT_MS = 5_000;
const DROP_RETRY_MS = 20;
const INSUFFICIENT_PRIVILEGE = "42501";

const isInsufficientPrivilege = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === INSUFFICIENT_PRIVILEGE;

const dropOnceAppBackendsLeave = async (
  client: Client,
  database: string,
  deadline: number,
): Promise<void> => {
  try {
    await client.query(`DROP DATABASE ${database} WITH (FORCE)`);
  } catch (error) {
    if (!isInsufficientPrivilege(error) || Date.now() >= deadline) {
      throw error;
    }
    await sleep(DROP_RETRY_MS);
    await dropOnceAppBackendsLeave(client, database, deadline);
  }
};

export type ThrowawayDatabase = {
  readonly migratorUrl: string;
  readonly appUrl: string;
  readonly drop: () => Promise<void>;
};

export const createThrowawayDatabase = async (): Promise<ThrowawayDatabase> => {
  const database = `dezyn_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  await asMigrator(async (client) => {
    await client.query(`CREATE DATABASE ${database}`);
    await client.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    await client.query(`GRANT CONNECT ON DATABASE ${database} TO app`);
  });

  return {
    migratorUrl: onDatabase(urlOf("DATABASE_URL_MIGRATOR"), database),
    appUrl: onDatabase(urlOf("DATABASE_URL"), database),
    drop: () =>
      asMigrator(async (client) => {
        await dropOnceAppBackendsLeave(client, database, Date.now() + DROP_TIMEOUT_MS);
      }),
  };
};

export const withThrowawayDatabase = async (
  run: (database: ThrowawayDatabase) => Promise<void>,
): Promise<void> => {
  const database = await createThrowawayDatabase();
  try {
    await run(database);
  } finally {
    await database.drop();
  }
};
