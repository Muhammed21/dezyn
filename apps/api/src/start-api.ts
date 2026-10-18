import { serve, type ServerType } from "@hono/node-server";

import { assertSchemaVersion, type Migration } from "@repo/db";

import { createApp } from "./create-app.ts";
import { createIdentityAuth } from "./modules/identity/infrastructure/better-auth.ts";
import { spaceModule } from "./modules/space/space-module.ts";
import type { LogSink } from "./platform/logging.ts";
import { createPostgresDatabase } from "./platform/postgres-database.ts";
import { createSmtpMailer } from "./platform/smtp-mailer.ts";

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
  log,
  authSecret,
  baseURL,
  trustedIpHeader,
  smtp,
  webUrl,
}: {
  readonly databaseUrl: string;
  readonly migration: Migration;
  readonly port: number;
  readonly log: LogSink;
  readonly authSecret: string;
  readonly baseURL: string;
  readonly trustedIpHeader: string;
  readonly smtp: { readonly host: string; readonly port: number; readonly from: string };
  readonly webUrl: string;
}): Promise<RunningApi> => {
  await assertSchemaVersion({ connectionString: databaseUrl, migration });
  const db = createPostgresDatabase({ url: databaseUrl });
  const spaces = spaceModule({ db, mailer: createSmtpMailer(smtp), webUrl });
  const auth = await createIdentityAuth({
    db,
    secret: authSecret,
    baseURL,
    trustedIpHeader,
    log,
    onUserCreated: spaces.createPersonalSpace,
  });
  const app = createApp({ db, auth, log, spaces });

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
