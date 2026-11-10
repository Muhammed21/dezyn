import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";

import { createPostgresDatabase, type PostgresDatabase } from "#db";
import type { LogRecord } from "#platform/logging.ts";
import { assertSchemaVersion, LATEST_MIGRATION } from "@repo/db";
import { migrate, schema } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { createPurgeWorker } from "../purge-worker.ts";

const { historyAuthor, historyEntry, identityUser, project, space, spaceMember } = schema;

const HYPERDRIVE_LOCAL = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";

const FREE_LIMIT = 500_000_000;

const seedSpaceAtItsLimit = async (app: PostgresDatabase) => {
  const spaceId = randomUUID();
  const ownerId = randomUUID();
  const authorId = randomUUID();
  const projectId = randomUUID();
  const ownerEmail = `${ownerId}@dezyn.test`;
  await app.orm.insert(identityUser).values({ id: ownerId, name: "Ada", email: ownerEmail });
  await app.orm
    .insert(space)
    .values({ id: spaceId, name: "Studio Ada", plan: "free", createdAt: new Date() });
  await app.orm
    .insert(spaceMember)
    .values({ id: randomUUID(), spaceId, userId: ownerId, role: "owner", joinedAt: new Date() });
  await app.orm
    .insert(project)
    .values({ id: projectId, spaceId, name: "Site vitrine", createdAt: new Date() });
  await app.orm.update(project).set({ storedBytes: FREE_LIMIT }).where(eq(project.id, projectId));
  await app.orm.insert(historyAuthor).values({ id: authorId, spaceId, userId: ownerId });
  await app.orm.insert(historyEntry).values({
    id: randomUUID(),
    spaceId,
    projectId,
    action: "project.created",
    authorId,
    clientId: null,
    before: null,
    after: { name: "Site vitrine" },
    correlationId: "semis",
    occurredAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  return { projectId, ownerEmail };
};

const jsonLines = (messages: readonly string[]): readonly unknown[] =>
  messages.flatMap((message) => {
    try {
      return [JSON.parse(message)];
    } catch {
      return [];
    }
  });

const withPurgeWorker = async (
  databaseUrl: string,
  run: (
    scheduled: () => Promise<{ readonly outcome: string }>,
    logs: () => readonly unknown[],
  ) => Promise<void>,
) => {
  process.env[HYPERDRIVE_LOCAL] = databaseUrl;
  const server = createTestHarness({
    root: new URL("../..", import.meta.url).pathname,
    workers: [{ configPath: "./wrangler.purge.jsonc", vars: { EMAIL_DELIVERY: "log" } }],
  });
  try {
    await server.listen();
    const worker = server.getWorker("dezyn-purge");
    await run(
      () => worker.scheduled({ cron: "*/15 * * * *", scheduledTime: new Date() }),
      () => jsonLines(server.getLogs().map(({ message }) => message)),
    );
  } finally {
    await server.close();
    delete process.env[HYPERDRIVE_LOCAL];
  }
};

describe("le Worker dezyn-purge en production (ADR 0042 §2)", () => {
  it(
    "un passage planifié purge un espace à sa limite et prévient son propriétaire",
    () =>
      withThrowawayDatabase(async ({ migratorUrl, appUrl, maintainerUrl }) => {
        await migrate({ connectionString: migratorUrl });
        const app = createPostgresDatabase({ url: appUrl });
        try {
          const { projectId, ownerEmail } = await seedSpaceAtItsLimit(app);

          await withPurgeWorker(maintainerUrl, async (scheduled, logs) => {
            expect(await scheduled()).toMatchObject({ outcome: "ok" });

            expect(
              await app.orm
                .select()
                .from(historyEntry)
                .where(eq(historyEntry.projectId, projectId)),
            ).toEqual([]);
            expect(logs()).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  msg: "email logged instead of sent",
                  to: ownerEmail,
                  subject: "L'historique de l'espace « Studio Ada » a été purgé sur dezyn",
                }),
                expect.objectContaining({ msg: "history_purge_pass", purgedSpaces: 1 }),
              ]),
            );
          });
        } finally {
          await app.close();
        }
      }),
    60_000,
  );
});

describe("un passage du Worker dezyn-purge", () => {
  it("purge, envoie l'email par Resend, journalise le passage et ferme la base", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl, maintainerUrl }) => {
      await migrate({ connectionString: migratorUrl });
      const app = createPostgresDatabase({ url: appUrl });
      try {
        const { projectId, ownerEmail } = await seedSpaceAtItsLimit(app);
        const logged: LogRecord[] = [];
        const sent: { readonly url: string; readonly body: unknown }[] = [];
        const pending: Promise<unknown>[] = [];
        const worker = createPurgeWorker({
          log: (record) => logged.push(record),
          assertSchema: (databaseUrl) =>
            assertSchemaVersion({ connectionString: databaseUrl, migration: LATEST_MIGRATION }),
          fetch: async (url, init) => {
            sent.push({
              url: String(url),
              body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
            });
            return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
          },
        });

        await worker.scheduled(
          { cron: "*/15 * * * *", scheduledTime: Date.now() },
          {
            HYPERDRIVE: { connectionString: maintainerUrl },
            RESEND_API_KEY: "re_cle",
            MAIL_FROM: "no-reply@dezyn.dev",
          },
          { waitUntil: (promise) => pending.push(promise) },
        );
        await Promise.all(pending);

        expect(
          await app.orm.select().from(historyEntry).where(eq(historyEntry.projectId, projectId)),
        ).toEqual([]);
        expect(sent).toEqual([
          {
            url: "https://api.resend.com/emails",
            body: expect.objectContaining({
              from: "dezyn <no-reply@dezyn.dev>",
              to: ownerEmail,
              subject: "L'historique de l'espace « Studio Ada » a été purgé sur dezyn",
            }),
          },
        ]);
        expect(logged).toContainEqual({
          level: "info",
          msg: "history_purge_pass",
          purgedSpaces: 1,
        });
        expect(pending).toHaveLength(1);
      } finally {
        await app.close();
      }
    }));
});
