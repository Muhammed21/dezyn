import { composeModules } from "#compose-modules";
import { createApp } from "#create-app";
import type { PostgresDatabase } from "#db";
import { createIdentityAuth } from "#modules/identity/infrastructure/better-auth.ts";
import type { LogSink } from "#platform/logging.ts";
import type { Mailer } from "#platform/mailer.ts";

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
  const modules = composeModules({ db, mailer, webUrl, log });
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
