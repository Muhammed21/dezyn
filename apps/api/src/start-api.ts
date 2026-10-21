import { serve, type ServerType } from "@hono/node-server";

import { composeModules } from "#compose-modules";
import { createApp } from "#create-app";
import { createPostgresDatabase, type PostgresDatabase } from "#db";
import { createIdentityAuth } from "#modules/identity/infrastructure/better-auth.ts";
import type { LogSink } from "#platform/logging.ts";
import type { Mailer } from "#platform/mailer.ts";
import { createSmtpMailer } from "#platform/smtp-mailer.ts";
import { assertSchemaVersion, type Migration } from "@repo/db";

export type RunningApi = {
  readonly url: string;
  readonly close: () => Promise<void>;
};

const closeServer = (server: ServerType) =>
  new Promise<void>((done, fail) => {
    server.close((error) => (error ? fail(error) : done()));
  });

export const buildApi = async ({
  db,
  mailer,
  log,
  authSecret,
  baseURL,
  trustedIpHeader,
  webUrl,
}: {
  readonly db: PostgresDatabase;
  readonly mailer: Mailer;
  readonly log: LogSink;
  readonly authSecret: string;
  readonly baseURL: string;
  readonly trustedIpHeader: string;
  readonly webUrl: string;
}) => {
  const modules = composeModules({ db, mailer, webUrl });
  const auth = await createIdentityAuth({
    db,
    secret: authSecret,
    baseURL,
    trustedIpHeader,
    log,
    onUserCreated: modules.spaces.createPersonalSpace,
  });
  return { app: createApp({ db, auth, log, ...modules }), modules };
};

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
  const db = createPostgresDatabase({ url: databaseUrl, log });
  const { app } = await buildApi({
    db,
    mailer: createSmtpMailer(smtp),
    log,
    authSecret,
    baseURL,
    trustedIpHeader,
    webUrl,
  });

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
