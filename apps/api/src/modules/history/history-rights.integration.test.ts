import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { migrate, schema } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { createPostgresDatabase, type PostgresDatabase } from "../../platform/postgres-database.ts";

const seedHistoryEntry = async (db: PostgresDatabase) => {
  const now = new Date();
  const userId = randomUUID();
  const spaceId = randomUUID();
  const projectId = randomUUID();
  const authorId = randomUUID();
  await db.orm
    .insert(schema.identityUser)
    .values({ id: userId, name: "Ada Lovelace", email: "ada@dezyn.test" });
  await db.orm
    .insert(schema.space)
    .values({ id: spaceId, name: "Ada", plan: "free", createdAt: now });
  await db.orm
    .insert(schema.project)
    .values({ id: projectId, spaceId, name: "Site vitrine", createdAt: now });
  await db.orm.insert(schema.historyAuthor).values({ id: authorId, spaceId, userId });
  await db.orm.insert(schema.historyEntry).values({
    id: randomUUID(),
    spaceId,
    projectId,
    action: "project.created",
    authorId,
    clientId: null,
    before: null,
    after: { name: "Site vitrine" },
    correlationId: "seed",
    occurredAt: now,
  });
};

const withAppDatabase = (run: (db: PostgresDatabase) => Promise<void>) =>
  withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
    await migrate({ connectionString: migratorUrl });
    const db = createPostgresDatabase({ url: appUrl });
    try {
      await run(db);
    } finally {
      await db.close();
    }
  });

describe("l'historique est en ajout seul pour le rôle app (ADR 0019 §1)", () => {
  it("app ajoute et lit une entrée", () =>
    withAppDatabase(async (db) => {
      await seedHistoryEntry(db);

      expect(await db.orm.select().from(schema.historyEntry)).toHaveLength(1);
    }));

  it("app ne modifie pas une entrée", () =>
    withAppDatabase(async (db) => {
      await seedHistoryEntry(db);

      await expect(
        db.orm.update(schema.historyEntry).set({ action: "project.renamed" }),
      ).rejects.toThrow(
        expect.objectContaining({
          cause: expect.objectContaining({ message: "permission denied for table history_entry" }),
        }),
      );
    }));

  it("app ne supprime pas une entrée", () =>
    withAppDatabase(async (db) => {
      await seedHistoryEntry(db);

      await expect(db.orm.delete(schema.historyEntry)).rejects.toThrow(
        expect.objectContaining({
          cause: expect.objectContaining({ message: "permission denied for table history_entry" }),
        }),
      );
    }));
});
