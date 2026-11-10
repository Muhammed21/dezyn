import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import type { AccessTokenIdentity, VerificationFailure } from "@repo/auth-verifier";
import type { Result } from "@repo/result";

import type { AppEnv } from "./http.ts";
import { FORBIDDEN, problemResponse } from "./problem.ts";

export type MemberIdentity = { readonly userId: string };

export type SessionFailure = "unavailable";

export type MemberEnv = {
  Variables: AppEnv["Variables"] & {
    identity: MemberIdentity;
  };
};

const BEARER = /^Bearer (\S+)$/i;

const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

const UNAVAILABLE = { type: "about:blank", title: "Service indisponible", status: 503 } as const;

export const requireMember = ({
  sessionOf,
  verifyAccessToken,
  resourceMetadataUrl,
}: {
  readonly sessionOf: (
    headers: Headers,
  ) => Promise<Result<MemberIdentity | undefined, SessionFailure>>;
  readonly verifyAccessToken: (
    token: string,
  ) => Promise<Result<AccessTokenIdentity, VerificationFailure>>;
  readonly resourceMetadataUrl: string;
}) => {
  const unauthorized = (c: Context<MemberEnv>, error?: "invalid_token") => {
    c.header(
      "www-authenticate",
      error === undefined
        ? `Bearer resource_metadata="${resourceMetadataUrl}"`
        : `Bearer error="${error}", resource_metadata="${resourceMetadataUrl}"`,
    );
    return problemResponse(c, { type: "about:blank", title: "Non authentifié", status: 401 });
  };

  return createMiddleware<MemberEnv>(async (c, next) => {
    const authorization = c.req.header("authorization");
    if (authorization !== undefined) {
      const token = BEARER.exec(authorization)?.[1];
      if (token === undefined) {
        return unauthorized(c);
      }
      const verification = await verifyAccessToken(token);
      if (!verification.ok) {
        return verification.error === "unavailable"
          ? problemResponse(c, UNAVAILABLE)
          : unauthorized(c, "invalid_token");
      }
      c.set("identity", { userId: verification.value.userId });
      await next();
      return undefined;
    }
    const session = await sessionOf(c.req.raw.headers);
    if (!session.ok) {
      return problemResponse(c, UNAVAILABLE);
    }
    if (session.value === undefined) {
      return unauthorized(c);
    }
    if (!READ_METHODS.has(c.req.method)) {
      return problemResponse(c, FORBIDDEN);
    }
    c.set("identity", { userId: session.value.userId });
    await next();
    return undefined;
  });
};
