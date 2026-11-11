import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";

import type { AppEnv } from "./http.ts";

export const webCors = (webUrl: string) => {
  const webOrigin = new URL(webUrl).origin;
  const allowWebOrigin = cors({
    origin: webOrigin,
    credentials: true,
    allowMethods: ["GET", "HEAD", "POST", "PATCH", "DELETE"],
    allowHeaders: ["content-type"],
  });
  return createMiddleware<AppEnv>(async (c, next) =>
    c.req.header("origin") === webOrigin ? allowWebOrigin(c, next) : next(),
  );
};
