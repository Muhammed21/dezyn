import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import type { AccessTokenIdentity, VerificationFailure } from "@repo/auth-verifier";
import type { Result } from "@repo/result";

import type { AppEnv } from "./http.ts";
import { problemResponse } from "./problem.ts";

export type AuthenticatedEnv = {
  Variables: AppEnv["Variables"] & {
    identity: AccessTokenIdentity;
  };
};

const BEARER = /^Bearer (\S+)$/i;

export const requireAccessToken = ({
  verifyAccessToken,
  resourceMetadataUrl,
}: {
  readonly verifyAccessToken: (
    token: string,
  ) => Promise<Result<AccessTokenIdentity, VerificationFailure>>;
  readonly resourceMetadataUrl: string;
}) => {
  const unauthorized = (c: Context<AuthenticatedEnv>, error?: "invalid_token") => {
    c.header(
      "www-authenticate",
      error === undefined
        ? `Bearer resource_metadata="${resourceMetadataUrl}"`
        : `Bearer error="${error}", resource_metadata="${resourceMetadataUrl}"`,
    );
    return problemResponse(c, { type: "about:blank", title: "Non authentifié", status: 401 });
  };

  return createMiddleware<AuthenticatedEnv>(async (c, next) => {
    const token = BEARER.exec(c.req.header("authorization") ?? "")?.[1];
    if (token === undefined) {
      return unauthorized(c);
    }
    const verification = await verifyAccessToken(token);
    if (!verification.ok) {
      return verification.error === "unavailable"
        ? problemResponse(c, { type: "about:blank", title: "Service indisponible", status: 503 })
        : unauthorized(c, "invalid_token");
    }
    c.set("identity", verification.value);
    await next();
    return undefined;
  });
};
