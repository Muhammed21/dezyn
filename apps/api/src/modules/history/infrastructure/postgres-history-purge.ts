import { asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import { type StorageMeter, storedSize } from "#modules/project/contracts/storage-meter.ts";
import { PLANS } from "#modules/space/contracts/plan.ts";
import { schema } from "@repo/db";

import type { PurgeBatch, PurgeCandidates, PurgeUnitOfWork } from "../application/purge-history.ts";

const { historyEntry, project, space } = schema;

const StoredCandidate = z.object({
  spaceId: z.string(),
  plan: z.enum(PLANS),
  storedBytes: z.coerce.number(),
  projectIds: z.array(z.string()),
});

const LockTaken = z.object({ taken: z.boolean() });

export const postgresPurgeLock = (tx: PostgresTransaction) => ({
  tryTake: async (spaceId: string): Promise<boolean> => {
    const { rows } = await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`history-purge:${spaceId}`}, 0)) AS taken`,
    );
    return LockTaken.parse(rows[0]).taken;
  },
});

const spaceStorage = (orm: Pick<PostgresTransaction, "select">) =>
  orm
    .select({
      spaceId: space.id,
      plan: space.plan,
      storedBytes: sql`sum(${project.storedBytes})`,
      projectIds: sql`array_agg(${project.id} ORDER BY ${project.storedBytes} DESC, ${project.id})`,
    })
    .from(space)
    .innerJoin(project, eq(project.spaceId, space.id))
    .groupBy(space.id)
    .$dynamic();

export const postgresPurgeCandidates = (db: PostgresDatabase): PurgeCandidates => ({
  list: async () =>
    z.array(StoredCandidate).parse(await spaceStorage(db.orm).orderBy(asc(space.id))),
});

const purgeBatchOn = (
  tx: PostgresTransaction,
  { spaceId, meter }: { readonly spaceId: string; readonly meter: StorageMeter },
): PurgeBatch => ({
  storage: async () => {
    const [row] = await spaceStorage(tx).where(eq(space.id, spaceId));
    const { plan, storedBytes } = StoredCandidate.parse(row);
    return { plan, storedBytes };
  },
  oldestEntriesOf: async (projectId, count) => {
    const rows = await tx
      .select()
      .from(historyEntry)
      .where(eq(historyEntry.projectId, projectId))
      .orderBy(asc(historyEntry.occurredAt), asc(historyEntry.id))
      .limit(count);
    return rows.map((row) => ({ id: row.id, occurredAt: row.occurredAt, size: storedSize(row) }));
  },
  purge: async ({ projectId, entryIds, purgedBefore, purgedAt }) => {
    const deleted = await tx
      .delete(historyEntry)
      .where(inArray(historyEntry.id, [...entryIds]))
      .returning();
    await meter.remove(projectId, deleted);
    await tx
      .update(project)
      .set({ historyPurgedBefore: purgedBefore, historyPurgedAt: purgedAt })
      .where(eq(project.id, projectId));
  },
});

export const postgresPurgeUnitOfWork = ({
  db,
  meterOn,
}: {
  readonly db: PostgresDatabase;
  readonly meterOn: (tx: PostgresTransaction) => StorageMeter;
}): PurgeUnitOfWork => ({
  batch: (spaceId, work) =>
    db.orm.transaction(async (tx) =>
      (await postgresPurgeLock(tx).tryTake(spaceId))
        ? work(purgeBatchOn(tx, { spaceId, meter: meterOn(tx) }))
        : undefined,
    ),
});
