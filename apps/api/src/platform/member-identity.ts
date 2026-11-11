import { createMiddleware } from "hono/factory";

import type { Result } from "@repo/result";

import {
  unauthorizedResponse,
  unavailableResponse,
  type VerifyAccessToken,
  verifyBearer,
} from "./access-token.ts";
import type { AppEnv } from "./http.ts";
import { FORBIDDEN, problemResponse } from "./problem.ts";

export type MemberIdentity = { readonly userId: string };

export type SessionFailure = "unavailable";

export type MemberEnv = {
  Variables: AppEnv["Variables"] & {
    identity: MemberIdentity;
  };
};

const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

export const requireMember = ({
  sessionOf,
  verifyAccessToken,
  resourceMetadataUrl,
  webUrl,
}: {
  readonly sessionOf: (
    headers: Headers,
  ) => Promise<Result<MemberIdentity | undefined, SessionFailure>>;
  readonly verifyAccessToken: VerifyAccessToken;
  readonly resourceMetadataUrl: string;
  readonly webUrl: string;
}) => {
  const webOrigin = new URL(webUrl).origin;
  const bearer = verifyBearer({ verifyAccessToken, resourceMetadataUrl });
  return createMiddleware<MemberEnv>(async (c, next) => {
    const authorization = c.req.header("authorization");
    if (authorization !== undefined) {
      const identity = await bearer(c, authorization);
      if (!identity.ok) {
        return identity.error;
      }
      c.set("identity", { userId: identity.value.userId });
      await next();
      return undefined;
    }
    const session = await sessionOf(c.req.raw.headers);
    if (!session.ok) {
      return unavailableResponse(c);
    }
    if (session.value === undefined) {
      return unauthorizedResponse(c, { resourceMetadataUrl });
    }
    if (!READ_METHODS.has(c.req.method) && c.req.header("origin") !== webOrigin) {
      return problemResponse(c, FORBIDDEN);
    }
    c.set("identity", { userId: session.value.userId });
    await next();
    return undefined;
  });
};
