import { Hono } from "hono";
import { z } from "zod";

import { Uuid } from "@repo/contracts";

import type { AuthenticatedEnv } from "../../../platform/access-token.ts";
import { validate } from "../../../platform/validate.ts";
import { decodeCursor } from "../application/history-cursor.ts";
import type { HistoryUseCases } from "../application/history-use-cases.ts";
import { DEFAULT_PAGE_SIZE } from "../application/read-history.ts";

const HistoryQuery = z.object({
  cursor: z
    .string()
    .transform((cursor, context) => {
      const position = decodeCursor(cursor);
      if (position === undefined) {
        context.addIssue({ code: "custom", message: "Curseur invalide" });
        return z.NEVER;
      }
      return position;
    })
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
});

export const historyRoutes = ({ readHistory }: HistoryUseCases) =>
  new Hono<AuthenticatedEnv>().get(
    "/:projectId/history",
    validate("query", HistoryQuery),
    async (c) => {
      const projectId = Uuid.safeParse(c.req.param("projectId")).data;
      if (projectId === undefined) {
        return c.notFound();
      }
      const { cursor, limit } = c.req.valid("query");
      const history = await readHistory({
        projectId,
        userId: c.get("identity").userId,
        after: cursor,
        limit,
      });
      return history.ok ? c.json(history.value) : c.notFound();
    },
  );
