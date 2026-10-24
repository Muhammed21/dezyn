import { serve, type ServerType } from "@hono/node-server";

import { createPostgresDatabase } from "#db";
import type { LogSink } from "#platform/logging.ts";
import { createSmtpMailer } from "#platform/smtp-mailer.ts";
import { assertSchemaVersion, type Migration } from "@repo/db";

import { buildApi } from "./build-api.ts";

const REQUEST_TIMEOUT_MS = 30_000;
const HEADERS_TIMEOUT_MS = 10_000;
const CONNECTIONS_CHECKING_INTERVAL_MS = 1_000;

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
  const db = createPostgresDatabase({ url: databaseUrl, log });
  const { app } = await buildApi({
    db,
    mailer: createSmtpMailer({ ...smtp, log }),
    log,
    authSecret,
    baseURL,
    trustedIpHeader,
    webUrl,
  });

  return new Promise((resolve) => {
    const server = serve(
      {
        fetch: app.fetch,
        port,
        serverOptions: {
          requestTimeout: REQUEST_TIMEOUT_MS,
          headersTimeout: HEADERS_TIMEOUT_MS,
          connectionsCheckingInterval: CONNECTIONS_CHECKING_INTERVAL_MS,
        },
      },
      (info) => {
        resolve({
          url: `http://127.0.0.1:${info.port}`,
          close: async () => {
            await closeServer(server);
            await db.close();
          },
        });
      },
    );
  });
};
