import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createPostgresDatabase, type PostgresDatabase } from "#db";
import { historyPurge, purgeLockOn } from "#modules/history/history-module.ts";
import { storedSize } from "#modules/project/contracts/storage-meter.ts";
import type { LogRecord } from "#platform/logging.ts";
import type { Mailer, OutgoingEmail } from "#platform/mailer.ts";
import { seedStoredBytes, storageMeterOn, storedBytesOf } from "#testing/project-storage.ts";
import { makeOutbox } from "#testing/space-fixtures.ts";
import { migrate, schema } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";
import { err, ok } from "@repo/result";

const { historyAuthor, historyEntry, identityUser, project, space, spaceMember } = schema;

const FREE_LIMIT = 500_000_000;

const FREE_TARGET = 450_000_000;

const FAR_ABOVE_FREE_LIMIT = 510_000_000;

const BIG_PAYLOAD = 26_000_000;

const STARTED_AT = new Date("2026-11-10T08:00:00.000Z");

const FIRST_ENTRY_AT = new Date("2026-01-01T00:00:00.000Z");

type Entry = typeof historyEntry.$inferSelect;

type Databases = { readonly app: PostgresDatabase; readonly maintainer: PostgresDatabase };

const withDatabases = (run: (databases: Databases) => Promise<void>) =>
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

const steppingClock = ({ stepMs = 0 }: { readonly stepMs?: number } = {}) => {
  const ticks = { count: 0 };
  return () => {
    const at = new Date(STARTED_AT.getTime() + ticks.count * stepMs);
    ticks.count += 1;
    return at;
  };
};

const purgeOf = (
  maintainer: PostgresDatabase,
  {
    now = steppingClock(),
    mailer = makeOutbox().mailer,
    log = () => undefined,
  }: {
    readonly now?: () => Date;
    readonly mailer?: Mailer;
    readonly log?: (record: LogRecord) => void;
  } = {},
) => historyPurge({ db: maintainer, meterOn: storageMeterOn, mailer, log, now });

const seedSpace = async (app: PostgresDatabase) => {
  const spaceId = randomUUID();
  const userId = randomUUID();
  const authorId = randomUUID();
  await app.orm
    .insert(identityUser)
    .values({ id: userId, name: "Ada Lovelace", email: `${userId}@dezyn.test` });
  await app.orm
    .insert(space)
    .values({ id: spaceId, name: "Studio Ada", plan: "free", createdAt: new Date() });
  await app.orm.insert(historyAuthor).values({ id: authorId, spaceId, userId });
  return { spaceId, authorId };
};

const seedProjectIn = async (
  app: PostgresDatabase,
  { spaceId, storedBytes }: { readonly spaceId: string; readonly storedBytes: number },
) => {
  const projectId = randomUUID();
  await app.orm
    .insert(project)
    .values({ id: projectId, spaceId, name: "Site vitrine", createdAt: new Date() });
  await seedStoredBytes(app, { projectId, bytes: storedBytes });
  return projectId;
};

const seedMember = async (
  app: PostgresDatabase,
  {
    spaceId,
    role,
    closedAt = null,
  }: {
    readonly spaceId: string;
    readonly role: "owner" | "editor";
    readonly closedAt?: Date | null;
  },
) => {
  const userId = randomUUID();
  const email = `${userId}@dezyn.test`;
  await app.orm.insert(identityUser).values({ id: userId, name: "Grace Hopper", email });
  await app.orm
    .insert(spaceMember)
    .values({ id: randomUUID(), spaceId, userId, role, joinedAt: new Date(), closedAt });
  return email;
};

const recipientsOf = (sent: readonly OutgoingEmail[]) => sent.map(({ to }) => to).toSorted();

const minutesAfterFirst = (minutes: number) =>
  new Date(FIRST_ENTRY_AT.getTime() + minutes * 60_000);

const makeEntry = (
  { spaceId, authorId }: { readonly spaceId: string; readonly authorId: string },
  {
    projectId,
    occurredAt,
    payloadBytes,
  }: { readonly projectId: string; readonly occurredAt: Date; readonly payloadBytes: number },
) => ({
  id: randomUUID(),
  spaceId,
  projectId,
  action: "token.updated",
  authorId,
  clientId: null,
  before: null,
  after: { value: "x".repeat(payloadBytes) },
  correlationId: "purge",
  occurredAt,
});

const seedEntries = async (
  app: PostgresDatabase,
  seeded: { readonly spaceId: string; readonly authorId: string },
  {
    projectId,
    count,
    payloadBytes = 10,
    minuteOf = (index: number) => index,
  }: {
    readonly projectId: string;
    readonly count: number;
    readonly payloadBytes?: number;
    readonly minuteOf?: (index: number) => number;
  },
): Promise<readonly Entry[]> => {
  const entries = Array.from({ length: count }, (_, index) =>
    makeEntry(seeded, { projectId, occurredAt: minutesAfterFirst(minuteOf(index)), payloadBytes }),
  );
  if (payloadBytes > 1_000_000) {
    return entries.reduce<Promise<readonly Entry[]>>(async (written, entry) => {
      const rows = await app.orm.insert(historyEntry).values(entry).returning();
      return [...(await written), ...rows];
    }, Promise.resolve([]));
  }
  return app.orm.insert(historyEntry).values(entries).returning();
};

const sizeOf = (entries: readonly Entry[]) =>
  entries.reduce((total, entry) => total + storedSize(entry), 0);

const remainingIdsOf = async (app: PostgresDatabase, projectId: string) => {
  const rows = await app.orm
    .select({ id: historyEntry.id })
    .from(historyEntry)
    .where(eq(historyEntry.projectId, projectId))
    .orderBy(asc(historyEntry.occurredAt), asc(historyEntry.id));
  return rows.map(({ id }) => id);
};

const idsOf = (entries: readonly Entry[]) => entries.map(({ id }) => id);

const traceOf = async (app: PostgresDatabase, projectId: string) => {
  const [row] = await app.orm
    .select({
      purgedBefore: project.historyPurgedBefore,
      purgedAt: project.historyPurgedAt,
    })
    .from(project)
    .where(eq(project.id, projectId));
  return row;
};

const byAgeThenId = (left: Entry, right: Entry) =>
  left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id);

describe("un espace sous sa limite n'est pas purgé", () => {
  it("ne supprime rien, ne change ni le compteur ni la trace", () =>
    withDatabases(async ({ app, maintainer }) => {
      const seeded = await seedSpace(app);
      const projectId = await seedProjectIn(app, {
        spaceId: seeded.spaceId,
        storedBytes: FREE_LIMIT - 1,
      });
      const entries = await seedEntries(app, seeded, { projectId, count: 3 });

      expect(await purgeOf(maintainer)()).toEqual([]);

      expect(await remainingIdsOf(app, projectId)).toEqual(idsOf(entries));
      expect(await storedBytesOf(app, projectId)).toBe(FREE_LIMIT - 1);
      expect(await traceOf(app, projectId)).toEqual({ purgedBefore: null, purgedAt: null });
    }));
});

describe("un espace à sa limite redescend à 90 % en supprimant ses plus anciennes entrées", () => {
  it("à la limite exacte, supprime les plus anciennes entrées jusqu'à passer sous 90 %", () =>
    withDatabases(async ({ app, maintainer }) => {
      const seeded = await seedSpace(app);
      const projectId = await seedProjectIn(app, {
        spaceId: seeded.spaceId,
        storedBytes: FREE_LIMIT,
      });
      const entries = await seedEntries(app, seeded, {
        projectId,
        count: 3,
        payloadBytes: BIG_PAYLOAD,
      });

      await purgeOf(maintainer)();

      expect(await remainingIdsOf(app, projectId)).toEqual(idsOf(entries.slice(2)));
      expect(await storedBytesOf(app, projectId)).toBe(FREE_LIMIT - sizeOf(entries.slice(0, 2)));
    }));

  it("s'arrête quand l'espace atteint exactement 90 %", () =>
    withDatabases(async ({ app, maintainer }) => {
      const seeded = await seedSpace(app);
      const projectId = await seedProjectIn(app, { spaceId: seeded.spaceId, storedBytes: 0 });
      const entries = await seedEntries(app, seeded, {
        projectId,
        count: 3,
        payloadBytes: BIG_PAYLOAD,
      });
      await seedStoredBytes(app, { projectId, bytes: FREE_TARGET + sizeOf(entries.slice(0, 2)) });

      await purgeOf(maintainer)();

      expect(await remainingIdsOf(app, projectId)).toEqual(idsOf(entries.slice(2)));
      expect(await storedBytesOf(app, projectId)).toBe(FREE_TARGET);
    }));

  it("supprime une entrée de plus quand il manque un octet pour atteindre 90 %", () =>
    withDatabases(async ({ app, maintainer }) => {
      const seeded = await seedSpace(app);
      const projectId = await seedProjectIn(app, { spaceId: seeded.spaceId, storedBytes: 0 });
      const entries = await seedEntries(app, seeded, {
        projectId,
        count: 4,
        payloadBytes: BIG_PAYLOAD,
      });
      await seedStoredBytes(app, {
        projectId,
        bytes: FREE_TARGET + sizeOf(entries.slice(0, 2)) + 1,
      });

      await purgeOf(maintainer)();

      expect(await remainingIdsOf(app, projectId)).toEqual(idsOf(entries.slice(3)));
      expect(await storedBytesOf(app, projectId)).toBe(
        FREE_TARGET + sizeOf(entries.slice(0, 2)) + 1 - sizeOf(entries.slice(0, 3)),
      );
    }));
});

describe("la purge commence par le projet qui consomme le plus, puis passe au suivant", () => {
  it("vide le plus gros projet avant d'entamer le suivant, et laisse les autres intacts", () =>
    withDatabases(async ({ app, maintainer }) => {
      const seeded = await seedSpace(app);
      const largest = await seedProjectIn(app, {
        spaceId: seeded.spaceId,
        storedBytes: 300_000_000,
      });
      const next = await seedProjectIn(app, { spaceId: seeded.spaceId, storedBytes: 200_000_000 });
      const untouched = await seedProjectIn(app, { spaceId: seeded.spaceId, storedBytes: 0 });
      const largestEntries = await seedEntries(app, seeded, { projectId: largest, count: 1 });
      const nextEntries = await seedEntries(app, seeded, {
        projectId: next,
        count: 3,
        payloadBytes: BIG_PAYLOAD,
        minuteOf: (index) => index + 10,
      });
      const untouchedEntries = await seedEntries(app, seeded, { projectId: untouched, count: 1 });

      const report = await purgeOf(maintainer)();

      expect(await remainingIdsOf(app, largest)).toEqual([]);
      expect(await remainingIdsOf(app, next)).toEqual(idsOf(nextEntries.slice(2)));
      expect(await remainingIdsOf(app, untouched)).toEqual(idsOf(untouchedEntries));
      expect(await storedBytesOf(app, largest)).toBe(300_000_000 - sizeOf(largestEntries));
      expect(await storedBytesOf(app, next)).toBe(200_000_000 - sizeOf(nextEntries.slice(0, 2)));
      expect(await storedBytesOf(app, untouched)).toBe(0);
      expect(report).toEqual([
        {
          spaceId: seeded.spaceId,
          name: "Studio Ada",
          projects: [
            {
              projectId: largest,
              name: "Site vitrine",
              deletedEntries: 1,
              purgedBefore: largestEntries[0]?.occurredAt,
            },
            {
              projectId: next,
              name: "Site vitrine",
              deletedEntries: 2,
              purgedBefore: nextEntries[1]?.occurredAt,
            },
          ],
        },
      ]);
      expect(await traceOf(app, largest)).toEqual({
        purgedBefore: largestEntries[0]?.occurredAt,
        purgedAt: STARTED_AT,
      });
      expect(await traceOf(app, next)).toEqual({
        purgedBefore: nextEntries[1]?.occurredAt,
        purgedAt: STARTED_AT,
      });
      expect(await traceOf(app, untouched)).toEqual({ purgedBefore: null, purgedAt: null });
    }));

  it("s'arrête sans erreur au-dessus de 90 % quand plus aucun projet n'a d'entrée", () =>
    withDatabases(async ({ app, maintainer }) => {
      const seeded = await seedSpace(app);
      const projectId = await seedProjectIn(app, {
        spaceId: seeded.spaceId,
        storedBytes: FREE_LIMIT,
      });
      const entries = await seedEntries(app, seeded, { projectId, count: 3 });

      const report = await purgeOf(maintainer)();

      expect(await remainingIdsOf(app, projectId)).toEqual([]);
      expect(await storedBytesOf(app, projectId)).toBe(FREE_LIMIT - sizeOf(entries));
      expect(report).toEqual([
        {
          spaceId: seeded.spaceId,
          name: "Studio Ada",
          projects: [
            {
              projectId,
              name: "Site vitrine",
              deletedEntries: 3,
              purgedBefore: entries[2]?.occurredAt,
            },
          ],
        },
      ]);
    }));
});

describe("un passage supprime par lots de 500 et s'arrête à son budget de 30 secondes", () => {
  it("le premier passage supprime deux lots en 30 secondes, le suivant reprend", () =>
    withDatabases(async ({ app, maintainer }) => {
      const seeded = await seedSpace(app);
      const projectId = await seedProjectIn(app, {
        spaceId: seeded.spaceId,
        storedBytes: FAR_ABOVE_FREE_LIMIT,
      });
      const entries = await seedEntries(app, seeded, {
        projectId,
        count: 1_101,
        minuteOf: (index) => Math.floor((index + 1) / 2),
      });
      const oldestFirst = entries.toSorted(byAgeThenId);

      const firstReport = await purgeOf(maintainer, { now: steppingClock({ stepMs: 10_000 }) })();

      expect(await remainingIdsOf(app, projectId)).toEqual(idsOf(oldestFirst.slice(1_000)));
      expect(firstReport).toEqual([
        {
          spaceId: seeded.spaceId,
          name: "Studio Ada",
          projects: [
            {
              projectId,
              name: "Site vitrine",
              deletedEntries: 1_000,
              purgedBefore: oldestFirst[999]?.occurredAt,
            },
          ],
        },
      ]);

      await purgeOf(maintainer, { now: steppingClock({ stepMs: 10_000 }) })();

      expect(await remainingIdsOf(app, projectId)).toEqual([]);
      expect(await storedBytesOf(app, projectId)).toBe(FAR_ABOVE_FREE_LIMIT - sizeOf(entries));
    }));
});

describe("un espace verrouillé par un autre passage est sauté", () => {
  it("ne purge pas l'espace verrouillé et purge les autres", () =>
    withDatabases(async ({ app, maintainer }) => {
      const locked = await seedSpace(app);
      const free = await seedSpace(app);
      const lockedProject = await seedProjectIn(app, {
        spaceId: locked.spaceId,
        storedBytes: FREE_LIMIT,
      });
      const freeProject = await seedProjectIn(app, {
        spaceId: free.spaceId,
        storedBytes: FREE_LIMIT,
      });
      const lockedEntries = await seedEntries(app, locked, { projectId: lockedProject, count: 2 });
      const freeEntries = await seedEntries(app, free, { projectId: freeProject, count: 2 });

      const report = await maintainer.orm.transaction(async (tx) => {
        expect(await purgeLockOn(tx).tryTake(locked.spaceId)).toBe(true);
        return purgeOf(maintainer)();
      });

      expect(await remainingIdsOf(app, lockedProject)).toEqual(idsOf(lockedEntries));
      expect(await storedBytesOf(app, lockedProject)).toBe(FREE_LIMIT);
      expect(await remainingIdsOf(app, freeProject)).toEqual([]);
      expect(report).toEqual([
        {
          spaceId: free.spaceId,
          name: "Studio Ada",
          projects: [
            {
              projectId: freeProject,
              name: "Site vitrine",
              deletedEntries: 2,
              purgedBefore: freeEntries[1]?.occurredAt,
            },
          ],
        },
      ]);
    }));

  it("deux passages simultanés ne suppriment pas plus qu'un seul", () =>
    withDatabases(async ({ app, maintainer }) => {
      const seeded = await seedSpace(app);
      const projectId = await seedProjectIn(app, {
        spaceId: seeded.spaceId,
        storedBytes: FREE_LIMIT,
      });
      const entries = await seedEntries(app, seeded, {
        projectId,
        count: 3,
        payloadBytes: BIG_PAYLOAD,
      });

      const reports = await Promise.all([purgeOf(maintainer)(), purgeOf(maintainer)()]);

      expect(await remainingIdsOf(app, projectId)).toEqual(idsOf(entries.slice(2)));
      expect(await storedBytesOf(app, projectId)).toBe(FREE_LIMIT - sizeOf(entries.slice(0, 2)));
      expect(
        reports
          .flat()
          .flatMap(({ projects }) => projects)
          .reduce((total, { deletedEntries }) => total + deletedEntries, 0),
      ).toBe(2);
    }));
});

describe("après un passage qui supprime, chaque propriétaire ouvert reçoit un email (ADR 0042 §5)", () => {
  it("envoie un seul email à chaque propriétaire ouvert, même après plusieurs lots", () =>
    withDatabases(async ({ app, maintainer }) => {
      const seeded = await seedSpace(app);
      const owners = await Promise.all([
        seedMember(app, { spaceId: seeded.spaceId, role: "owner" }),
        seedMember(app, { spaceId: seeded.spaceId, role: "owner" }),
      ]);
      await seedMember(app, { spaceId: seeded.spaceId, role: "editor" });
      await seedMember(app, { spaceId: seeded.spaceId, role: "owner", closedAt: new Date() });
      const projectId = await seedProjectIn(app, {
        spaceId: seeded.spaceId,
        storedBytes: FAR_ABOVE_FREE_LIMIT,
      });
      await seedEntries(app, seeded, { projectId, count: 1_101 });
      const { sent, mailer } = makeOutbox();

      await purgeOf(maintainer, { mailer })();

      expect(recipientsOf(sent)).toEqual(owners.toSorted());
      expect(sent).toEqual(
        owners.map(() =>
          expect.objectContaining({
            subject: "L'historique de l'espace « Studio Ada » a été purgé sur dezyn",
            text: expect.stringContaining(
              "« Site vitrine » : 1101 entrées supprimées, la plus récente du 1 janvier 2026.",
            ),
          }),
        ),
      );
      const storedAfter = (await storedBytesOf(app, projectId)) ?? 0;
      expect(sent[0]?.text).toContain(
        `L'espace « Studio Ada » utilise maintenant ${Math.floor(storedAfter / 1_000_000)} Mo sur 500 Mo.`,
      );
    }));

  it("n'envoie rien pour un espace sous sa limite ou verrouillé", () =>
    withDatabases(async ({ app, maintainer }) => {
      const under = await seedSpace(app);
      const locked = await seedSpace(app);
      await seedMember(app, { spaceId: under.spaceId, role: "owner" });
      await seedMember(app, { spaceId: locked.spaceId, role: "owner" });
      const underProject = await seedProjectIn(app, {
        spaceId: under.spaceId,
        storedBytes: FREE_LIMIT - 1,
      });
      const lockedProject = await seedProjectIn(app, {
        spaceId: locked.spaceId,
        storedBytes: FREE_LIMIT,
      });
      await seedEntries(app, under, { projectId: underProject, count: 1 });
      await seedEntries(app, locked, { projectId: lockedProject, count: 1 });
      const { sent, mailer } = makeOutbox();

      await maintainer.orm.transaction(async (tx) => {
        await purgeLockOn(tx).tryTake(locked.spaceId);
        await purgeOf(maintainer, { mailer })();
      });

      expect(sent).toEqual([]);
    }));

  it("journalise un envoi qui échoue, sans empêcher les autres emails ni défaire la purge", () =>
    withDatabases(async ({ app, maintainer }) => {
      const seeded = await seedSpace(app);
      const unreachable = await seedMember(app, { spaceId: seeded.spaceId, role: "owner" });
      const reachable = await seedMember(app, { spaceId: seeded.spaceId, role: "owner" });
      const projectId = await seedProjectIn(app, {
        spaceId: seeded.spaceId,
        storedBytes: FREE_LIMIT,
      });
      await seedEntries(app, seeded, { projectId, count: 2 });
      const sent: OutgoingEmail[] = [];
      const records: LogRecord[] = [];
      const mailer: Mailer = {
        send: async (email) => {
          if (email.to === unreachable) {
            return err("mail_unavailable");
          }
          sent.push(email);
          return ok(undefined);
        },
      };

      await purgeOf(maintainer, { mailer, log: (record) => records.push(record) })();

      expect(recipientsOf(sent)).toEqual([reachable]);
      expect(records).toEqual([
        {
          level: "error",
          msg: "history_purge_email_unsent",
          spaceId: seeded.spaceId,
          to: unreachable,
          error: "mail_unavailable",
        },
      ]);
      expect(await remainingIdsOf(app, projectId)).toEqual([]);
    }));
});
