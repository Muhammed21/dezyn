import { serve, type ServerType } from "@hono/node-server";

import { composeModules } from "#compose-modules";
import { createApp } from "#create-app";
import { createPostgresDatabase } from "#db";
import { createIdentityAuth } from "#modules/identity/infrastructure/better-auth.ts";
import type { LogSink } from "#platform/logging.ts";
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
  const { spaces, projects, history, tokens, proposals } = composeModules({
    db,
    mailer: createSmtpMailer(smtp),
    webUrl,
  });
  const auth = await createIdentityAuth({
    db,
    secret: authSecret,
    baseURL,
    trustedIpHeader,
    log,
    onUserCreated: spaces.createPersonalSpace,
  });
  const app = createApp({ db, auth, log, spaces, projects, history, tokens, proposals });

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
