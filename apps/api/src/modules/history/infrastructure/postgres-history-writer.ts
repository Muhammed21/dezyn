import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { PostgresTransaction } from "#db";
import { schema } from "@repo/db";

import type { HistoryWriter } from "../domain/history-writer.ts";

const { historyAuthor, historyEntry } = schema;

const StoredAuthor = z.object({ id: z.string() });

export const postgresHistoryWriter = (
  tx: PostgresTransaction,
  { newId }: { readonly newId: () => string },
): HistoryWriter => ({
  append: async ({ userId, ...entry }) => {
    await tx
      .insert(historyAuthor)
      .values({ id: newId(), spaceId: entry.spaceId, userId })
      .onConflictDoNothing({ target: [historyAuthor.spaceId, historyAuthor.userId] });
    const [author] = await tx
      .select({ id: historyAuthor.id })
      .from(historyAuthor)
      .where(and(eq(historyAuthor.spaceId, entry.spaceId), eq(historyAuthor.userId, userId)));
    await tx
      .insert(historyEntry)
      .values({ ...entry, id: newId(), authorId: StoredAuthor.parse(author).id });
  },
});
