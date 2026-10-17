import { serve, type ServerType } from "@hono/node-server";

import { assertSchemaVersion, type Migration } from "@repo/db";

import { createApp } from "./create-app.ts";
import { createPostgresDatabase } from "./platform/postgres-database.ts";

export type RunningApi = {
  readonly url: string;
  readonly close: () => Promise<void>;
};

const closeServer = (server: ServerType) =>
  new Promise<void>((done, fail) => {
    server.close((error) => (error ? fail(error) : done()));
  });

export const startApi = async ({
  databaseUrl,
  migration,
  port,
}: {
  readonly databaseUrl: string;
  readonly migration: Migration;
  readonly port: number;
}): Promise<RunningApi> => {
  await assertSchemaVersion({ connectionString: databaseUrl, migration });
  const db = createPostgresDatabase({ url: databaseUrl });
  const app = createApp({ db });

  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port }, (info) => {
      resolve({
        url: `http://127.0.0.1:${info.port}`,
        close: async () => {
          await closeServer(server);
          await db.close();
        },
      });
    });
  });
};
