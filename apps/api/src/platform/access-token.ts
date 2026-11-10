import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import type { AccessTokenIdentity, VerificationFailure } from "@repo/auth-verifier";
import { err, ok, type Result } from "@repo/result";

import type { AppEnv } from "./http.ts";
import { problemResponse } from "./problem.ts";

export type AuthenticatedEnv = {
  Variables: AppEnv["Variables"] & {
    identity: AccessTokenIdentity;
  };
};

export type VerifyAccessToken = (
  token: string,
) => Promise<Result<AccessTokenIdentity, VerificationFailure>>;

const BEARER = /^Bearer (\S+)$/i;

export const unavailableResponse = <E extends AppEnv>(c: Context<E>) =>
  problemResponse(c, { type: "about:blank", title: "Service indisponible", status: 503 });

export const unauthorizedResponse = <E extends AppEnv>(
  c: Context<E>,
  {
    resourceMetadataUrl,
    error,
  }: { readonly resourceMetadataUrl: string; readonly error?: "invalid_token" },
) => {
  c.header(
    "www-authenticate",
    error === undefined
      ? `Bearer resource_metadata="${resourceMetadataUrl}"`
      : `Bearer error="${error}", resource_metadata="${resourceMetadataUrl}"`,
  );
  return problemResponse(c, { type: "about:blank", title: "Non authentifié", status: 401 });
};

export const verifyBearer =
  ({
    verifyAccessToken,
    resourceMetadataUrl,
  }: {
    readonly verifyAccessToken: VerifyAccessToken;
    readonly resourceMetadataUrl: string;
  }) =>
  async <E extends AppEnv>(
    c: Context<E>,
    authorization: string | undefined,
  ): Promise<Result<AccessTokenIdentity, Response>> => {
    const token = BEARER.exec(authorization ?? "")?.[1];
    if (token === undefined) {
      return err(unauthorizedResponse(c, { resourceMetadataUrl }));
    }
    const verification = await verifyAccessToken(token);
    if (!verification.ok) {
      return err(
        verification.error === "unavailable"
          ? unavailableResponse(c)
          : unauthorizedResponse(c, { resourceMetadataUrl, error: "invalid_token" }),
      );
    }
    return ok(verification.value);
  };

export const requireAccessToken = (options: {
  readonly verifyAccessToken: VerifyAccessToken;
  readonly resourceMetadataUrl: string;
}) => {
  const bearer = verifyBearer(options);
  return createMiddleware<AuthenticatedEnv>(async (c, next) => {
    const identity = await bearer(c, c.req.header("authorization"));
    if (!identity.ok) {
      return identity.error;
    }
    c.set("identity", identity.value);
    await next();
    return undefined;
  });
};
