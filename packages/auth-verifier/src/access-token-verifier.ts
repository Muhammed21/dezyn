import { createRemoteJWKSet, customFetch, errors, type FetchImplementation, jwtVerify } from "jose";
import { z } from "zod";

import { err, ok, type Result } from "@repo/result";

const JWKS_CACHE_MAX_AGE_MS = 10 * 60_000;
const JWKS_RELOAD_COOLDOWN_MS = 60_000;

export type Grant = {
  readonly sid: string;
  readonly userId: string;
  readonly clientId: string;
};

export interface ActiveGrants {
  isActive(grant: Grant): Promise<boolean>;
}

export type AccessTokenIdentity = {
  readonly userId: string;
  readonly sid: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
};

export type VerificationFailure = "invalid_token" | "revoked" | "unavailable";

const AccessTokenClaims = z.object({
  sub: z.string(),
  sid: z.string(),
  azp: z.string(),
  scope: z.string().optional(),
});

const TOKEN_REFUSALS = [
  errors.JWSInvalid,
  errors.JWTInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JWTClaimValidationFailed,
  errors.JWTExpired,
  errors.JWKSNoMatchingKey,
  errors.JOSEAlgNotAllowed,
];

const refusesToken = (error: unknown) => TOKEN_REFUSALS.some((refusal) => error instanceof refusal);

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
  activeGrants,
  fetchJwks = fetch,
}: {
  readonly jwksUrl: string;
  readonly issuer: string;
  readonly audience: string;
  readonly activeGrants: ActiveGrants;
  readonly fetchJwks?: FetchImplementation;
}) => {
  const keySet = createRemoteJWKSet(new URL(jwksUrl), {
    cacheMaxAge: JWKS_CACHE_MAX_AGE_MS,
    cooldownDuration: JWKS_RELOAD_COOLDOWN_MS,
    [customFetch]: fetchJwks,
  });

  const signedIdentity = async (
    token: string,
  ): Promise<Result<AccessTokenIdentity, "invalid_token" | "unavailable">> => {
    try {
      const { payload } = await jwtVerify(token, keySet, {
        issuer,
        audience,
        typ: "at+jwt",
        algorithms: ["EdDSA"],
      });
      const claims = AccessTokenClaims.safeParse(payload);
      return claims.success ? ok(identityOf(claims.data)) : err("invalid_token");
    } catch (error) {
      return err(refusesToken(error) ? "invalid_token" : "unavailable");
    }
  };

  const grantOf = async ({
    sid,
    userId,
    clientId,
  }: AccessTokenIdentity): Promise<"active" | "revoked" | "unavailable"> => {
    try {
      return (await activeGrants.isActive({ sid, userId, clientId })) ? "active" : "revoked";
    } catch {
      return "unavailable";
    }
  };

  return {
    verify: async (token: string): Promise<Result<AccessTokenIdentity, VerificationFailure>> => {
      const signed = await signedIdentity(token);
      if (!signed.ok) {
        return signed;
      }
      const grant = await grantOf(signed.value);
      return grant === "active" ? signed : err(grant);
    },
  };
};
