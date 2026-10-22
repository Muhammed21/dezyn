import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { PostgresTransaction } from "#db";
import type { StorageMeter } from "#modules/project/contracts/storage-meter.ts";
import { schema } from "@repo/db";

import type { HistoryWriter } from "../domain/history-writer.ts";

const { historyAuthor, historyEntry } = schema;

const StoredAuthor = z.object({ id: z.string() });

export const postgresHistoryWriter = (
  tx: PostgresTransaction,
  { newId, meter }: { readonly newId: () => string; readonly meter: StorageMeter },
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
    const written = await tx
      .insert(historyEntry)
      .values({ ...entry, id: newId(), authorId: StoredAuthor.parse(author).id })
      .returning();
    await meter.add(entry.projectId, written);
  },
});
