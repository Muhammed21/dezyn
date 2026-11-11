import { z } from "zod";

import { err, ok, type Result } from "@repo/result";

import {
  failureOf,
  type Fetch,
  type HttpFailure,
  parseJson,
  send,
  TOO_MANY_REQUESTS,
} from "../../../platform/http.ts";
import type { IdentityGateway } from "../application/identity-gateway.ts";
import type { Session } from "../domain/session.ts";

const AuthUser = z.object({ id: z.string(), email: z.string() });

const SignInResponse = z.object({ user: AuthUser });

const GetSessionResponse = z.object({ user: AuthUser }).nullable();

const UNAUTHORIZED = 401;

const sessionOf = ({ id, email }: z.infer<typeof AuthUser>): Session => ({ userId: id, email });

export const createHttpIdentityGateway = ({
  apiUrl,
  fetch,
}: {
  readonly apiUrl: string;
  readonly fetch: Fetch;
}): IdentityGateway => ({
  signIn: async (credentials) => {
    const sent = await send(fetch, `${apiUrl}/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials),
    });
    if (!sent.ok) {
      return sent;
    }
    const response = sent.value;
    if (response.status === UNAUTHORIZED) {
      return err("invalid_credentials");
    }
    if (response.status === TOO_MANY_REQUESTS) {
      return err("rate_limited");
    }
    if (!response.ok) {
      return err(failureOf(response));
    }
    const body = await parseJson(response, SignInResponse);
    return body.ok ? ok(sessionOf(body.value.user)) : body;
  },
  currentSession: async (): Promise<Result<Session | undefined, HttpFailure>> => {
    const sent = await send(fetch, `${apiUrl}/auth/get-session`, { method: "GET" });
    if (!sent.ok) {
      return sent;
    }
    const response = sent.value;
    if (!response.ok) {
      return err(failureOf(response));
    }
    const body = await parseJson(response, GetSessionResponse);
    if (!body.ok) {
      return body;
    }
    return ok(body.value === null ? undefined : sessionOf(body.value.user));
  },
});
