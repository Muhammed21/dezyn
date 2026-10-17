import { randomUUID } from "node:crypto";

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
        await client.query(`DROP DATABASE ${database} WITH (FORCE)`);
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
