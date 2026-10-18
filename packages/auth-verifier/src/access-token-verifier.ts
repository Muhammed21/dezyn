import { createRemoteJWKSet, customFetch, type FetchImplementation, jwtVerify } from "jose";
import { z } from "zod";

import { err, ok, type Result } from "@repo/result";

const JWKS_CACHE_MAX_AGE_MS = 10 * 60_000;
const JWKS_RELOAD_COOLDOWN_MS = 60_000;

export type AccessTokenIdentity = {
  readonly userId: string;
  readonly sid: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
};

export type VerificationFailure = "invalid_token";

const AccessTokenClaims = z.object({
  sub: z.string(),
  sid: z.string(),
  azp: z.string(),
  scope: z.string().optional(),
});

const identityOf = ({ sub, sid, azp, scope }: z.infer<typeof AccessTokenClaims>) => ({
  userId: sub,
  sid,
  clientId: azp,
  scopes: scope === undefined ? [] : scope.split(" "),
});

export const createAccessTokenVerifier = ({
  jwksUrl,
  issuer,
  audience,
  fetchJwks = fetch,
}: {
  readonly jwksUrl: string;
  readonly issuer: string;
  readonly audience: string;
  readonly fetchJwks?: FetchImplementation;
}) => {
  const keySet = createRemoteJWKSet(new URL(jwksUrl), {
    cacheMaxAge: JWKS_CACHE_MAX_AGE_MS,
    cooldownDuration: JWKS_RELOAD_COOLDOWN_MS,
    [customFetch]: fetchJwks,
  });

  return {
    verify: async (token: string): Promise<Result<AccessTokenIdentity, VerificationFailure>> => {
      try {
        const { payload } = await jwtVerify(token, keySet, {
          issuer,
          audience,
          typ: "at+jwt",
          algorithms: ["EdDSA"],
        });
        return ok(identityOf(AccessTokenClaims.parse(payload)));
      } catch {
        return err("invalid_token");
      }
    },
  };
};
