import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createPostgresDatabase, type PostgresDatabase } from "#db";
import { migrate, schema } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

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
  const entry = {
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
  };
  await db.orm.insert(schema.historyEntry).values(entry);
  return entry;
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

const withMaintainerDatabase = (
  run: (databases: { app: PostgresDatabase; maintainer: PostgresDatabase }) => Promise<void>,
) =>
  withThrowawayDatabase(async ({ migratorUrl, appUrl, maintainerUrl }) => {
    await migrate({ connectionString: migratorUrl });
    const app = createPostgresDatabase({ url: appUrl });
    const maintainer = createPostgresDatabase({ url: maintainerUrl });
    try {
      await run({ app, maintainer });
    } finally {
      await Promise.all([app.close(), maintainer.close()]);
    }
  });

const permissionDenied = (table: string) =>
  expect.objectContaining({
    cause: expect.objectContaining({ message: `permission denied for table ${table}` }),
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
      ).rejects.toThrow(permissionDenied("history_entry"));
    }));

  it("app ne supprime pas une entrée", () =>
    withAppDatabase(async (db) => {
      await seedHistoryEntry(db);

      await expect(db.orm.delete(schema.historyEntry)).rejects.toThrow(
        permissionDenied("history_entry"),
      );
    }));
});

describe("le rôle app crée et lit les projets, sans les modifier", () => {
  it("app ne modifie pas un projet", () =>
    withAppDatabase(async (db) => {
      await seedHistoryEntry(db);

      await expect(db.orm.update(schema.project).set({ name: "Boutique" })).rejects.toThrow(
        permissionDenied("project"),
      );
    }));
});

describe("le rôle history_maintainer purge l'historique, sans le modifier (ADR 0019 §2)", () => {
  it("history_maintainer supprime une entrée", () =>
    withMaintainerDatabase(async ({ app, maintainer }) => {
      await seedHistoryEntry(app);

      await maintainer.orm.delete(schema.historyEntry);

      expect(await app.orm.select().from(schema.historyEntry)).toEqual([]);
    }));

  it("history_maintainer ne modifie pas une entrée", () =>
    withMaintainerDatabase(async ({ app, maintainer }) => {
      await seedHistoryEntry(app);

      await expect(
        maintainer.orm.update(schema.historyEntry).set({ action: "project.renamed" }),
      ).rejects.toThrow(permissionDenied("history_entry"));
    }));

  it("history_maintainer n'ajoute pas d'entrée", () =>
    withMaintainerDatabase(async ({ app, maintainer }) => {
      const entry = await seedHistoryEntry(app);

      await expect(
        maintainer.orm.insert(schema.historyEntry).values({ ...entry, id: randomUUID() }),
      ).rejects.toThrow(permissionDenied("history_entry"));
    }));
});

describe("le rôle history_maintainer lit ce que la purge exige et ne touche qu'au compteur et à la trace du projet (ADR 0042 §7)", () => {
  it("history_maintainer lit les espaces, les projets et les membres", () =>
    withMaintainerDatabase(async ({ app, maintainer }) => {
      await seedHistoryEntry(app);

      expect(await maintainer.orm.select().from(schema.space)).toHaveLength(1);
      expect(await maintainer.orm.select().from(schema.project)).toHaveLength(1);
      expect(await maintainer.orm.select().from(schema.spaceMember)).toEqual([]);
    }));

  it("history_maintainer lit l'identifiant, l'email et le nom des utilisateurs", () =>
    withMaintainerDatabase(async ({ app, maintainer }) => {
      await seedHistoryEntry(app);

      expect(
        await maintainer.orm
          .select({
            id: schema.identityUser.id,
            email: schema.identityUser.email,
            name: schema.identityUser.name,
          })
          .from(schema.identityUser),
      ).toEqual([expect.objectContaining({ email: "ada@dezyn.test", name: "Ada Lovelace" })]);
    }));

  it("history_maintainer ne lit pas les autres colonnes des utilisateurs", () =>
    withMaintainerDatabase(async ({ app, maintainer }) => {
      await seedHistoryEntry(app);

      await expect(maintainer.orm.select().from(schema.identityUser)).rejects.toThrow(
        permissionDenied("identity_user"),
      );
    }));

  it("history_maintainer met à jour le compteur et la trace de purge d'un projet", () =>
    withMaintainerDatabase(async ({ app, maintainer }) => {
      await seedHistoryEntry(app);
      const purgedAt = new Date("2026-11-10T08:00:00.000Z");

      await maintainer.orm.update(schema.project).set({
        storedBytes: 12,
        historyPurgedBefore: purgedAt,
        historyPurgedAt: purgedAt,
      });

      expect(await app.orm.select().from(schema.project)).toEqual([
        expect.objectContaining({
          storedBytes: 12,
          historyPurgedBefore: purgedAt,
          historyPurgedAt: purgedAt,
        }),
      ]);
    }));

  it("history_maintainer ne renomme pas un projet", () =>
    withMaintainerDatabase(async ({ app, maintainer }) => {
      await seedHistoryEntry(app);

      await expect(maintainer.orm.update(schema.project).set({ name: "Boutique" })).rejects.toThrow(
        permissionDenied("project"),
      );
    }));

  it("history_maintainer ne crée ni ne supprime de projet", () =>
    withMaintainerDatabase(async ({ app, maintainer }) => {
      await seedHistoryEntry(app);
      const [space] = await app.orm.select({ id: schema.space.id }).from(schema.space);

      await expect(
        maintainer.orm.insert(schema.project).values({
          id: randomUUID(),
          spaceId: space?.id ?? "",
          name: "Boutique",
          createdAt: new Date(),
        }),
      ).rejects.toThrow(permissionDenied("project"));
      await expect(maintainer.orm.delete(schema.project)).rejects.toThrow(
        permissionDenied("project"),
      );
    }));

  it("history_maintainer n'écrit pas dans les espaces", () =>
    withMaintainerDatabase(async ({ app, maintainer }) => {
      await seedHistoryEntry(app);

      await expect(
        maintainer.orm.update(schema.space).set({ storageAlertedAt: null }),
      ).rejects.toThrow(permissionDenied("space"));
    }));

  it("history_maintainer n'écrit pas dans les membres", () =>
    withMaintainerDatabase(async ({ app, maintainer }) => {
      await seedHistoryEntry(app);

      await expect(maintainer.orm.delete(schema.spaceMember)).rejects.toThrow(
        permissionDenied("space_member"),
      );
    }));
});
