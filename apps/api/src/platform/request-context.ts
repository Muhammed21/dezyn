import { randomUUID } from "node:crypto";

import { createMiddleware } from "hono/factory";

import type { AppEnv } from "./http.ts";
import type { LogSink } from "./logging.ts";

const CORRELATION_HEADER = "x-correlation-id";
const PROVIDED_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const requestContext = (log: LogSink) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const provided = c.req.header(CORRELATION_HEADER);
    const correlationId =
      provided !== undefined && PROVIDED_ID.test(provided) ? provided : randomUUID();
    const startedAt = performance.now();
    c.set("correlationId", correlationId);
    c.header(CORRELATION_HEADER, correlationId);
    await next();
    log({
      level: "info",
      msg: "request",
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
      correlationId,
    });
  });
