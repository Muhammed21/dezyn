import type { AccessTokenIdentity, VerificationFailure } from "@repo/auth-verifier";
import type { Result } from "@repo/result";

export type Auth = {
  readonly baseURL: string;
  readonly handle: (request: Request) => Promise<Response>;
  readonly authorizationServerMetadata: (request: Request) => Promise<Response>;
  readonly protectedResourceMetadata: (request: Request) => Promise<Response>;
  readonly verifyAccessToken: (
    token: string,
  ) => Promise<Result<AccessTokenIdentity, VerificationFailure>>;
};
