import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";

import type { PostgresDatabase } from "#db";
import { schema } from "@repo/db";

import type { HistoryReader } from "../application/read-history.ts";

const { historyAuthor, historyEntry, identityUser, spaceMember } = schema;

const StoredEntry = z.object({
  id: z.string(),
  action: z.string(),
  spaceId: z.string(),
  projectId: z.string(),
  userId: z.string(),
  name: z.string(),
  openMembershipId: z.string().nullable(),
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
        openMembershipId: spaceMember.id,
        clientId: historyEntry.clientId,
        before: historyEntry.before,
        after: historyEntry.after,
        occurredAt: historyEntry.occurredAt,
        correlationId: historyEntry.correlationId,
      })
      .from(historyEntry)
      .innerJoin(historyAuthor, eq(historyAuthor.id, historyEntry.authorId))
      .innerJoin(identityUser, eq(identityUser.id, historyAuthor.userId))
      .leftJoin(
        spaceMember,
        and(
          eq(spaceMember.spaceId, historyEntry.spaceId),
          eq(spaceMember.userId, historyAuthor.userId),
          isNull(spaceMember.closedAt),
        ),
      )
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
      const { userId, name, openMembershipId, ...entry } = StoredEntry.parse(row);
      return {
        ...entry,
        author: {
          kind: "member",
          userId,
          name,
          membership: openMembershipId === null ? "left" : "active",
        },
      };
    });
  },
});
