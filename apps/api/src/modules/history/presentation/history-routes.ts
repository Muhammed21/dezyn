import { Hono } from "hono";

import { Uuid } from "@repo/contracts";

import type { AuthenticatedEnv } from "../../../platform/access-token.ts";
import type { HistoryUseCases } from "../application/history-use-cases.ts";

export const historyRoutes = ({ readHistory }: HistoryUseCases) =>
  new Hono<AuthenticatedEnv>().get("/:projectId/history", async (c) => {
    const projectId = Uuid.safeParse(c.req.param("projectId")).data;
    if (projectId === undefined) {
      return c.notFound();
    }
    const history = await readHistory({ projectId, userId: c.get("identity").userId });
    return history.ok ? c.json({ entries: history.value }) : c.notFound();
  });
