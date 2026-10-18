import { and, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";

import { schema } from "@repo/db";

import type { PostgresDatabase } from "../../../platform/postgres-database.ts";
import type { HistoryReader } from "../application/read-history.ts";

const { historyAuthor, historyEntry, identityUser } = schema;

const StoredEntry = z.object({
  id: z.string(),
  action: z.string(),
  spaceId: z.string(),
  projectId: z.string(),
  userId: z.string(),
  name: z.string(),
  clientId: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  occurredAt: z.date(),
  correlationId: z.string(),
});

export const postgresHistoryReader = (db: PostgresDatabase): HistoryReader => ({
  entriesOf: async (projectId, { after, take }) => {
    const rows = await db.orm
      .select({
        id: historyEntry.id,
        action: historyEntry.action,
        spaceId: historyEntry.spaceId,
        projectId: historyEntry.projectId,
        userId: historyAuthor.userId,
        name: identityUser.name,
        clientId: historyEntry.clientId,
        before: historyEntry.before,
        after: historyEntry.after,
        occurredAt: historyEntry.occurredAt,
        correlationId: historyEntry.correlationId,
      })
      .from(historyEntry)
      .innerJoin(historyAuthor, eq(historyAuthor.id, historyEntry.authorId))
      .innerJoin(identityUser, eq(identityUser.id, historyAuthor.userId))
      .where(
        and(
          eq(historyEntry.projectId, projectId),
          after === undefined
            ? undefined
            : or(
                lt(historyEntry.occurredAt, after.occurredAt),
                and(eq(historyEntry.occurredAt, after.occurredAt), lt(historyEntry.id, after.id)),
              ),
        ),
      )
      .orderBy(desc(historyEntry.occurredAt), desc(historyEntry.id))
      .limit(take);
    return rows.map((row) => {
      const { userId, name, ...entry } = StoredEntry.parse(row);
      return { ...entry, author: { kind: "member", userId, name } };
    });
  },
});
