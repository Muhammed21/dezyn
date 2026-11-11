import type { z } from "zod";

import { err, ok, type Result } from "@repo/result";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type HttpFailure = "unavailable" | "invalid_response";

export const TOO_MANY_REQUESTS = 429;

export const send = async (
  fetch: Fetch,
  url: string,
  init: RequestInit,
): Promise<Result<Response, "unavailable">> => {
  try {
    return ok(await fetch(url, { ...init, credentials: "include" }));
  } catch {
    return err("unavailable");
  }
};

export const parseJson = async <T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<Result<T, "invalid_response">> => {
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  return parsed.success ? ok(parsed.data) : err("invalid_response");
};

export const failureOf = (response: Response): HttpFailure =>
  response.status >= 500 || response.status === TOO_MANY_REQUESTS
    ? "unavailable"
    : "invalid_response";
