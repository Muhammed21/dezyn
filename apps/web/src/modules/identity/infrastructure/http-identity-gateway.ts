import { z } from "zod";

import { err, ok, type Result } from "@repo/result";

import type { IdentityGateway } from "../application/identity-gateway.ts";
import type { Session } from "../domain/session.ts";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const AuthUser = z.object({ id: z.string(), email: z.string() });

const SignInResponse = z.object({ user: AuthUser });

const GetSessionResponse = z.object({ user: AuthUser }).nullable();

type HttpFailure = "unavailable" | "invalid_response";

const sessionOf = ({ id, email }: z.infer<typeof AuthUser>): Session => ({ userId: id, email });

const send = async (fetch: Fetch, url: string, init: RequestInit) => {
  try {
    return ok(await fetch(url, { ...init, credentials: "include" }));
  } catch {
    return err("unavailable" as const);
  }
};

const parse = async <T>(response: Response, schema: z.ZodType<T>) => {
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  return parsed.success ? ok(parsed.data) : err("invalid_response" as const);
};

const TOO_MANY_REQUESTS = 429;

const failureOf = (response: Response): HttpFailure =>
  response.status >= 500 || response.status === TOO_MANY_REQUESTS
    ? "unavailable"
    : "invalid_response";

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
    if (response.status === 401) {
      return err("invalid_credentials");
    }
    if (response.status === TOO_MANY_REQUESTS) {
      return err("rate_limited");
    }
    if (!response.ok) {
      return err(failureOf(response));
    }
    const body = await parse(response, SignInResponse);
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
    const body = await parse(response, GetSessionResponse);
    if (!body.ok) {
      return body;
    }
    return ok(body.value === null ? undefined : sessionOf(body.value.user));
  },
});
