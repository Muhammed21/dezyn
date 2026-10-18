import { Hono } from "hono";

import type { Auth } from "./modules/identity/application/auth.ts";
import { authPages } from "./modules/identity/presentation/auth-pages.ts";
import { registerWhoami } from "./modules/identity/presentation/whoami-tool.ts";
import { type AuthenticatedEnv, requireAccessToken } from "./platform/access-token.ts";
import type { Database } from "./platform/database.ts";
import type { AppEnv } from "./platform/http.ts";
import { errorDetails, type LogSink } from "./platform/logging.ts";
import { mcpEndpoint } from "./platform/mcp.ts";
import { clientProblem, INTERNAL_ERROR, problemResponse } from "./platform/problem.ts";
import { requestContext } from "./platform/request-context.ts";

export const createApp = ({
  db,
  auth,
  log,
}: {
  readonly db: Database;
  readonly auth: Auth;
  readonly log: LogSink;
}) => {
  const app = new Hono<AppEnv>();

  app.use(requestContext(log));

  app.on(["GET", "POST"], "/auth/*", (c) => auth.handle(c.req.raw));
  app.route("/", authPages({ auth, baseURL: auth.baseURL }));
  const v1 = new Hono<AuthenticatedEnv>().use(
    requireAccessToken({
      verifyAccessToken: auth.verifyAccessToken,
      resourceMetadataUrl: new URL("/.well-known/oauth-protected-resource/v1", auth.baseURL).href,
    }),
  );
  v1.post("/mcp", mcpEndpoint({ registerTools: registerWhoami }));
  app.route("/v1", v1);
  app.get("/.well-known/oauth-authorization-server", (c) =>
    auth.authorizationServerMetadata(c.req.raw),
  );
  app.get("/.well-known/oauth-authorization-server/auth", (c) =>
    auth.authorizationServerMetadata(c.req.raw),
  );
  app.get("/.well-known/oauth-protected-resource", (c) =>
    auth.protectedResourceMetadata(c.req.raw),
  );
  app.get("/.well-known/oauth-protected-resource/v1", (c) =>
    auth.protectedResourceMetadata(c.req.raw),
  );

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
