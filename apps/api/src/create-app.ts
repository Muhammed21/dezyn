import { Hono } from "hono";

import type { Database } from "./platform/database.ts";

export const createApp = ({ db }: { readonly db: Database }) => {
  const app = new Hono();

  app.get("/health", async (c) => {
    try {
      await db.ping();
    } catch {
      return c.body(null, 503);
    }
    return c.json({ status: "ok" });
  });

  return app;
};
