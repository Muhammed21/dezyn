import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import { GRACE, obtainAccessToken, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { storageMeterOn } from "#testing/project-storage.ts";
import { schema } from "@repo/db";

import type { HistoryEntryDraft } from "./domain/history-writer.ts";
import { postgresHistoryWriter } from "./infrastructure/postgres-history-writer.ts";

const UNIQUE_VIOLATION = "23505";

const authorIdOf = async (db: PostgresDatabase, userId: string) => {
  const [author] = await db.orm
    .select({ id: schema.historyAuthor.id })
    .from(schema.historyAuthor)
    .where(eq(schema.historyAuthor.userId, userId));
  return String(author?.id);
};

const makeIdSequence = (first: string) => {
  let given = false;
  return () => {
    if (given) {
      return randomUUID();
    }
    given = true;
    return first;
  };
};

const makeEntryDraft = (
  overrides: Pick<HistoryEntryDraft, "spaceId" | "projectId" | "userId">,
): HistoryEntryDraft => ({
  action: "mcp.read_history",
  clientId: null,
  before: null,
  after: null,
  correlationId: randomUUID(),
  occurredAt: new Date("2026-10-23T09:00:00Z"),
  ...overrides,
});

const appendEntry = (
  db: PostgresDatabase,
  { entry, newId }: { readonly entry: HistoryEntryDraft; readonly newId: () => string },
) =>
  db.orm.transaction((tx) =>
    postgresHistoryWriter(tx, { newId, meter: storageMeterOn(tx) }).append(entry),
  );

describe("l'écriture d'une entrée d'historique en base", () => {
  it("un identifiant d'auteur déjà pris n'est pas confondu avec un auteur déjà connu", () =>
    withIdentityApp(async (app, db) => {
      const { spaceId, projectId, userId } = await seedProject(app, db);
      const grace = await obtainAccessToken(app, { user: GRACE });
      const takenId = await authorIdOf(db, userId);

      await expect(
        appendEntry(db, {
          entry: makeEntryDraft({ spaceId, projectId, userId: grace.userId }),
          newId: makeIdSequence(takenId),
        }),
      ).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
    }));
});
