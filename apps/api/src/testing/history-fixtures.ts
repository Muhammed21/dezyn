import type { PostgresDatabase } from "#db";
import { schema } from "@repo/db";

const authorIdOf = async (db: PostgresDatabase) => {
  const [author] = await db.orm.select({ id: schema.historyAuthor.id }).from(schema.historyAuthor);
  return author?.id ?? "";
};

export const seedHistoryEntries = async (
  db: PostgresDatabase,
  {
    spaceId,
    projectId,
    entries,
  }: {
    readonly spaceId: string;
    readonly projectId: string;
    readonly entries: readonly { readonly id: string; readonly occurredAt: Date }[];
  },
) => {
  const authorId = await authorIdOf(db);
  await db.orm.insert(schema.historyEntry).values(
    entries.map(({ id, occurredAt }) => ({
      id,
      spaceId,
      projectId,
      action: "project.created",
      authorId,
      clientId: null,
      before: null,
      after: null,
      correlationId: "semis",
      occurredAt,
    })),
  );
};
