import { randomUUID } from "node:crypto";

import { oauthProvider, oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins/jwt";

import { schema } from "@repo/db";

import type { LogSink } from "../../../platform/logging.ts";
import type { PostgresDatabase } from "../../../platform/postgres-database.ts";
import type { Auth } from "../application/auth.ts";
import { defaultToNativeForLoopback } from "../domain/client-registration.ts";

const DAY_SECONDS = 86_400;
const HOUR_SECONDS = 3_600;

export const REGISTRATION_RATE_LIMIT = { window: HOUR_SECONDS, max: 10 } as const;

export const IDENTITY_SCHEMA = {
  user: schema.identityUser,
  session: schema.identitySession,
  account: schema.identityAccount,
  verification: schema.identityVerification,
  jwks: schema.identityJwks,
  oauthClient: schema.identityOAuthClient,
  oauthResource: schema.identityOAuthResource,
  oauthClientResource: schema.identityOAuthClientResource,
  oauthRefreshToken: schema.identityOAuthRefreshToken,
  oauthAccessToken: schema.identityOAuthAccessToken,
  oauthConsent: schema.identityOAuthConsent,
  oauthClientAssertion: schema.identityOAuthClientAssertion,
};

export const generateIdentityId = (): string => randomUUID();

export const apiResourceOf = (baseURL: string): string => new URL("/v1", baseURL).href;

export const identityAuthOptions = ({
  baseURL,
  trustedIpHeader,
}: {
  readonly baseURL: string;
  readonly trustedIpHeader: string;
}) =>
  ({
    basePath: "/auth",
    baseURL,
    advanced: {
      database: { generateId: generateIdentityId },
      ipAddress: { ipAddressHeaders: [trustedIpHeader] },
    },
    rateLimit: {
      enabled: true,
      customRules: { "/oauth2/register": REGISTRATION_RATE_LIMIT },
    },
    emailAndPassword: { enabled: true },
    hooks: {
      before: createAuthMiddleware(async (ctx) =>
        ctx.path === "/oauth2/register"
          ? { context: { body: defaultToNativeForLoopback(ctx.body) } }
          : undefined,
      ),
    },
    plugins: [
      jwt({ jwks: { rotationInterval: 90 * DAY_SECONDS, gracePeriod: DAY_SECONDS } }),
      oauthProvider({
        loginPage: "/login",
        consentPage: "/consent",
        resources: [apiResourceOf(baseURL)],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }),
    ],
  }) satisfies BetterAuthOptions;

export const createIdentityAuth = async ({
  db,
  secret,
  baseURL,
  trustedIpHeader,
  log,
}: {
  readonly db: PostgresDatabase;
  readonly secret: string;
  readonly baseURL: string;
  readonly trustedIpHeader: string;
  readonly log: LogSink;
}): Promise<Auth> => {
  const auth = betterAuth({
    ...identityAuthOptions({ baseURL, trustedIpHeader }),
    secret,
    database: drizzleAdapter(db.orm, { provider: "pg", schema: IDENTITY_SCHEMA }),
    logger: {
      log: (level, message) => {
        log({ level, msg: message, source: "better-auth" });
      },
    },
  });
  await auth.$context;
  const authorizationServerMetadata = oauthProviderAuthServerMetadata(auth);

  return {
    handle: (request) => auth.handler(request),
    authorizationServerMetadata,
    protectedResourceMetadata: async () =>
      Response.json({
        resource: apiResourceOf(baseURL),
        authorization_servers: [(await auth.api.getOAuthServerConfig()).issuer],
        bearer_methods_supported: ["header"],
      }),
  };
};
