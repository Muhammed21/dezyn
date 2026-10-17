import { Hono } from "hono";

import type { Database } from "./platform/database.ts";
import type { AppEnv } from "./platform/http.ts";
import { errorDetails, type LogSink } from "./platform/logging.ts";
import { clientProblem, INTERNAL_ERROR, problemResponse } from "./platform/problem.ts";
import { requestContext } from "./platform/request-context.ts";

export const createApp = ({ db, log }: { readonly db: Database; readonly log: LogSink }) => {
  const app = new Hono<AppEnv>();

  app.use(requestContext(log));

  app.get("/health", async (c) => {
    try {
      await db.ping();
    } catch {
      return problemResponse(c, {
        type: "about:blank",
        title: "Service indisponible",
        status: 503,
      });
    }
    return c.json({ status: "ok" });
  });

  app.notFound((c) =>
    problemResponse(c, { type: "about:blank", title: "Ressource introuvable", status: 404 }),
  );

  app.onError((error, c) => {
    const problem = clientProblem(error);
    if (problem !== undefined) {
      return problemResponse(c, problem);
    }
    log({
      level: "error",
      msg: "unhandled",
      correlationId: c.get("correlationId"),
      ...errorDetails(error),
    });
    return problemResponse(c, INTERNAL_ERROR);
  });

  return app;
};
