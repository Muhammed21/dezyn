import { createHash, randomBytes, randomUUID } from "node:crypto";

import { oauthProvider, oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { betterAuth, type BetterAuthOptions, type GenericEndpointContext } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins/jwt";
import { z } from "zod";

import { createAccessTokenVerifier } from "@repo/auth-verifier";
import { schema } from "@repo/db";

import type { LogSink } from "../../../platform/logging.ts";
import type { PostgresDatabase } from "../../../platform/postgres-database.ts";
import type { Auth } from "../application/auth.ts";
import { defaultToNativeForLoopback } from "../domain/client-registration.ts";
import { refreshGrantOutcome } from "../domain/refresh-grant.ts";
import { postgresActiveSessions } from "./postgres-active-sessions.ts";

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

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("base64url");

export const generateRefreshToken = (): string => randomBytes(32).toString("base64url");

export const apiResourceOf = (baseURL: string): string => new URL("/v1", baseURL).href;

const RefreshGrant = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string(),
});

const StoredRefreshToken = z.object({
  userId: z.string(),
  sessionId: z.string().nullable(),
  revoked: z.date().nullable(),
  rotationReplayExpiresAt: z.date().nullable(),
  authTime: z.date().nullable(),
});

const guardRefreshGrant = async (ctx: GenericEndpointContext): Promise<void> => {
  const grant = RefreshGrant.safeParse(ctx.body);
  if (!grant.success) {
    return;
  }
  const stored = StoredRefreshToken.safeParse(
    await ctx.context.adapter.findOne({
      model: "oauthRefreshToken",
      where: [{ field: "token", value: hashToken(grant.data.refresh_token) }],
    }),
  );
  if (!stored.success) {
    return;
  }
  const outcome = refreshGrantOutcome({ token: stored.data, now: new Date() });
  if (outcome === "reuse") {
    await ctx.context.internalAdapter.deleteUserSessions(stored.data.userId);
    return;
  }
  if (outcome !== "allowed") {
    throw new APIError("BAD_REQUEST", { error: "invalid_grant" });
  }
};

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
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/oauth2/token") {
          await guardRefreshGrant(ctx);
          return undefined;
        }
        return ctx.path === "/oauth2/register"
          ? { context: { body: defaultToNativeForLoopback(ctx.body) } }
          : undefined;
      }),
    },
    plugins: [
      jwt({ jwks: { rotationInterval: 90 * DAY_SECONDS, gracePeriod: DAY_SECONDS } }),
      oauthProvider({
        loginPage: "/login",
        consentPage: "/consent",
        resources: [apiResourceOf(baseURL)],
        enforcePerClientResources: false,
        scopes: ["offline_access"],
        accessTokenExpiresIn: 15 * 60,
        refreshTokenExpiresIn: 60 * DAY_SECONDS,
        refreshTokenReuseInterval: 30,
        generateRefreshToken,
        storeTokens: { hash: hashToken },
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
  const issuer = (await auth.api.getOAuthServerConfig()).issuer;
  const verifier = createAccessTokenVerifier({
    jwksUrl: new URL("/auth/jwks", baseURL).href,
    issuer,
    audience: apiResourceOf(baseURL),
    activeSessions: postgresActiveSessions(db),
    fetchJwks: (url) => auth.handler(new Request(url)),
  });
  const authorizationServerMetadata = oauthProviderAuthServerMetadata(auth);

  return {
    baseURL,
    handle: (request) => auth.handler(request),
    verifyAccessToken: verifier.verify,
    authorizationServerMetadata,
    protectedResourceMetadata: async () =>
      Response.json({
        resource: apiResourceOf(baseURL),
        authorization_servers: [issuer],
        bearer_methods_supported: ["header"],
      }),
  };
};
