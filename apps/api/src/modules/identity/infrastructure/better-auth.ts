import { randomUUID } from "node:crypto";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { schema } from "@repo/db";

import type { LogSink } from "../../../platform/logging.ts";
import type { PostgresDatabase } from "../../../platform/postgres-database.ts";
import type { Auth } from "../application/auth.ts";

export const generateIdentityId = (): string => randomUUID();

export const createIdentityAuth = ({
  db,
  secret,
  baseURL,
  log,
}: {
  readonly db: PostgresDatabase;
  readonly secret: string;
  readonly baseURL: string;
  readonly log: LogSink;
}): Auth => {
  const auth = betterAuth({
    basePath: "/auth",
    secret,
    baseURL,
    logger: {
      log: (level, message) => {
        log({ level, msg: message, source: "better-auth" });
      },
    },
    database: drizzleAdapter(db.orm, {
      provider: "pg",
      schema: {
        user: schema.identityUser,
        session: schema.identitySession,
        account: schema.identityAccount,
        verification: schema.identityVerification,
      },
    }),
    advanced: { database: { generateId: generateIdentityId } },
    emailAndPassword: { enabled: true },
  });

  return { handle: (request) => auth.handler(request) };
};
