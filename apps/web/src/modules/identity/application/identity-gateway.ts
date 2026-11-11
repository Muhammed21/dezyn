import type { Result } from "@repo/result";

import type { Credentials, Registration, Session } from "../domain/session.ts";

export type SignInFailure =
  | "invalid_credentials"
  | "rate_limited"
  | "unavailable"
  | "invalid_response";

export type SignUpFailure =
  | "invalid_name"
  | "email_taken"
  | "invalid_email"
  | "invalid_password"
  | "rate_limited"
  | "unavailable"
  | "invalid_response";

export type SessionFailure = "unavailable" | "invalid_response";

export type SignOutFailure = "unavailable" | "invalid_response";

export type IdentityGateway = {
  readonly signIn: (credentials: Credentials) => Promise<Result<Session, SignInFailure>>;
  readonly signUp: (registration: Registration) => Promise<Result<Session, SignUpFailure>>;
  readonly signOut: () => Promise<Result<undefined, SignOutFailure>>;
  readonly currentSession: () => Promise<Result<Session | undefined, SessionFailure>>;
};
