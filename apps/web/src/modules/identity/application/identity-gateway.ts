import type { Result } from "@repo/result";

import type { Credentials, Session } from "../domain/session.ts";

export type SignInFailure =
  | "invalid_credentials"
  | "rate_limited"
  | "unavailable"
  | "invalid_response";

export type SessionFailure = "unavailable" | "invalid_response";

export type IdentityGateway = {
  readonly signIn: (credentials: Credentials) => Promise<Result<Session, SignInFailure>>;
  readonly currentSession: () => Promise<Result<Session | undefined, SessionFailure>>;
};
