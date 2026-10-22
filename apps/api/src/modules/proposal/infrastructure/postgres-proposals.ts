import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { StorageMeter } from "#modules/project/contracts/storage-meter.ts";
import type { StorageAlertDecision } from "#modules/space/contracts/storage-alert.ts";
import { TokenDefinitionInput } from "#modules/token/contracts/token-definition.ts";
import type { ValidatedTokenWriter } from "#modules/token/contracts/token-issues.ts";
import { schema } from "@repo/db";
import type { Err, Result } from "@repo/result";

import type {
  FigmaStateSynchronizer,
  ProposalReader,
  ReviewUnit,
  ReviewUnitOfWork,
} from "../application/review-proposals.ts";
import type { ProposalStore, ProposalUnitOfWork, Writer } from "../application/write-tokens.ts";
import type { Proposal, ProposalBatch } from "../domain/proposal.ts";

const { proposal, proposalBatch } = schema;

const findOpenBatch = async (
  tx: PostgresTransaction,
  { projectId, userId, clientId }: Writer,
): Promise<ProposalBatch | undefined> => {
  const [batch] = await tx
    .select()
    .from(proposalBatch)
    .where(
      and(
        eq(proposalBatch.projectId, projectId),
        eq(proposalBatch.userId, userId),
        eq(proposalBatch.clientId, clientId),
        eq(proposalBatch.state, "open"),
      ),
    );
  return batch === undefined ? undefined : { ...batch, state: "open" };
};

export const postgresProposalReplacer = (tx: PostgresTransaction) => ({
  replace: async ({ projectId, name }: { readonly projectId: string; readonly name: string }) => {
    const [replaced] = await tx
      .update(proposal)
      .set({ status: "replaced" })
      .where(
        and(
          eq(proposal.tokenName, name),
          eq(proposal.status, "proposed"),
          inArray(
            proposal.batchId,
            tx
              .select({ id: proposalBatch.id })
              .from(proposalBatch)
              .where(eq(proposalBatch.projectId, projectId)),
          ),
        ),
      )
      .returning({ id: proposal.id, batchId: proposal.batchId });
    return replaced ?? null;
  },
});

const resize = async (
  meter: StorageMeter,
  {
    before,
    after,
  }: {
    readonly before: readonly object[];
    readonly after: readonly { readonly projectId: string }[];
  },
) => {
  const [changed] = after;
  if (changed === undefined) {
    return;
  }
  await meter.remove(changed.projectId, before);
  await meter.add(changed.projectId, after);
};

export const postgresProposalStore = (
  tx: PostgresTransaction,
  meter: StorageMeter,
): ProposalStore => ({
  pendingOf: async (projectId, names) => {
    await [...new Set(names)]
      .toSorted()
      .reduce<Promise<unknown>>(
        (locked, name) =>
          locked.then(() =>
            tx.execute(
              sql`select pg_advisory_xact_lock(hashtextextended(${`${projectId}:${name}`}, 0))`,
            ),
          ),
        Promise.resolve(),
      );
    const rows = await tx
      .select({ proposal })
      .from(proposal)
      .innerJoin(proposalBatch, eq(proposalBatch.id, proposal.batchId))
      .where(
        and(
          eq(proposalBatch.projectId, projectId),
          eq(proposal.status, "proposed"),
          inArray(proposal.tokenName, [...names]),
        ),
      )
      .for("update", { of: proposal });
    return rows.map((row) => proposalOf(row.proposal));
  },
  replace: async (proposalIds) => {
    const before = await tx
      .select()
      .from(proposal)
      .where(inArray(proposal.id, [...proposalIds]));
    const after = await tx
      .update(proposal)
      .set({ status: "replaced" })
      .where(inArray(proposal.id, [...proposalIds]))
      .returning();
    await resize(meter, { before, after });
  },
  findOpenBatch: (writer) => findOpenBatch(tx, writer),
  openBatchOf: async (candidate) => {
    const opened = await tx
      .insert(proposalBatch)
      .values(candidate)
      .onConflictDoNothing()
      .returning();
    await meter.add(candidate.projectId, opened);
    return (await findOpenBatch(tx, candidate)) ?? candidate;
  },
  closeBatch: async (batchId) => {
    const before = await tx.select().from(proposalBatch).where(eq(proposalBatch.id, batchId));
    const after = await tx
      .update(proposalBatch)
      .set({ state: "closed" })
      .where(eq(proposalBatch.id, batchId))
      .returning();
    await resize(meter, { before, after });
  },
  touchBatch: async (batchId, lastWrittenAt) => {
    const before = await tx.select().from(proposalBatch).where(eq(proposalBatch.id, batchId));
    const after = await tx
      .update(proposalBatch)
      .set({ lastWrittenAt })
      .where(eq(proposalBatch.id, batchId))
      .returning();
    await resize(meter, { before, after });
  },
  propose: async (projectId, proposals) => {
    const proposed = await tx
      .insert(proposal)
      .values(
        proposals.map(({ id, batchId, name, kind, token, status, createdAt }) => ({
          id,
          projectId,
          batchId,
          tokenName: name,
          kind,
          payload: token,
          status,
          createdAt,
        })),
      )
      .returning();
    await meter.add(projectId, proposed);
  },
});

export const postgresProposalUnitOfWork = ({
  db,
  storageMeterOn,
  storageAlertOn,
}: {
  readonly db: PostgresDatabase;
  readonly storageMeterOn: (tx: PostgresTransaction) => StorageMeter;
  readonly storageAlertOn: (tx: PostgresTransaction) => StorageAlertDecision;
}): ProposalUnitOfWork => ({
  run: (work) =>
    db.orm.transaction((tx) =>
      work(postgresProposalStore(tx, storageMeterOn(tx)), storageAlertOn(tx)),
    ),
});

const BatchState = z.enum(["open", "closed"]);

const ProposalStatus = z.enum(["proposed", "validated", "rejected", "replaced"]);

const ProposalRow = z.object({
  id: z.string(),
  batchId: z.string(),
  tokenName: z.string(),
  kind: z.enum(["create", "update"]),
  payload: TokenDefinitionInput,
  status: ProposalStatus,
  createdAt: z.date(),
});

const proposalOf = (row: unknown): Proposal => {
  const { tokenName, payload, ...parsed } = ProposalRow.parse(row);
  return { ...parsed, name: tokenName, token: payload };
};

const storedBatchOf = ({ state, ...batch }: typeof proposalBatch.$inferSelect): ProposalBatch => ({
  ...batch,
  state: BatchState.parse(state),
});

export const postgresProposalReader = (db: PostgresDatabase): ProposalReader => ({
  batchesOf: async (projectId) => {
    const rows = await db.orm
      .select({
        id: proposalBatch.id,
        intent: proposalBatch.intent,
        state: proposalBatch.state,
        lastWrittenAt: proposalBatch.lastWrittenAt,
        toReview: count(proposal.id),
      })
      .from(proposalBatch)
      .leftJoin(
        proposal,
        and(eq(proposal.batchId, proposalBatch.id), eq(proposal.status, "proposed")),
      )
      .where(eq(proposalBatch.projectId, projectId))
      .groupBy(proposalBatch.id)
      .orderBy(desc(proposalBatch.openedAt), desc(proposalBatch.id));
    return rows.map(({ state, ...row }) => ({ ...row, state: BatchState.parse(state) }));
  },
  batch: async (batchId) => {
    const [batch] = await db.orm.select().from(proposalBatch).where(eq(proposalBatch.id, batchId));
    if (batch === undefined) {
      return undefined;
    }
    const rows = await db.orm
      .select()
      .from(proposal)
      .where(eq(proposal.batchId, batchId))
      .orderBy(asc(proposal.position));
    return { ...storedBatchOf(batch), proposals: rows.map(proposalOf) };
  },
  pendingTokensOf: async (projectId) => {
    const rows = await db.orm
      .select({ proposal })
      .from(proposal)
      .innerJoin(proposalBatch, eq(proposalBatch.id, proposal.batchId))
      .where(and(eq(proposalBatch.projectId, projectId), eq(proposal.status, "proposed")));
    return rows.map((row) => {
      const { name, $type } = proposalOf(row.proposal).token;
      return { name, $type };
    });
  },
  pendingProposalsOf: async (projectId) => {
    const rows = await db.orm
      .select({
        proposal,
        batch: {
          id: proposalBatch.id,
          state: proposalBatch.state,
          lastWrittenAt: proposalBatch.lastWrittenAt,
        },
      })
      .from(proposal)
      .innerJoin(proposalBatch, eq(proposalBatch.id, proposal.batchId))
      .where(and(eq(proposalBatch.projectId, projectId), eq(proposal.status, "proposed")))
      .orderBy(asc(proposal.tokenName));
    return rows.map((row) => ({
      ...proposalOf(row.proposal),
      batch: { ...row.batch, state: BatchState.parse(row.batch.state) },
    }));
  },
  proposal: async (proposalId) => {
    const [row] = await db.orm
      .select({ proposal, projectId: proposalBatch.projectId })
      .from(proposal)
      .innerJoin(proposalBatch, eq(proposalBatch.id, proposal.batchId))
      .where(eq(proposal.id, proposalId));
    return row === undefined
      ? undefined
      : { proposal: proposalOf(row.proposal), projectId: row.projectId };
  },
});

export const postgresReviewUnitOfWork = ({
  db,
  historyWriterOn,
  validatedTokenWriterOn,
  figmaStateOn,
  storageMeterOn,
}: {
  readonly db: PostgresDatabase;
  readonly storageMeterOn: (tx: PostgresTransaction) => StorageMeter;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
  readonly validatedTokenWriterOn: (tx: PostgresTransaction) => ValidatedTokenWriter;
  readonly figmaStateOn: (tx: PostgresTransaction) => FigmaStateSynchronizer;
}): ReviewUnitOfWork => ({
  async run<T, E>(work: (unit: ReviewUnit) => Promise<Result<T, E>>): Promise<Result<T, E>> {
    class RolledBack extends Error {
      readonly failure: Err<E>;

      constructor(failure: Err<E>) {
        super("Transaction annulée");
        this.failure = failure;
      }
    }
    return db.orm
      .transaction(async (tx) => {
        const outcome = await work({
          proposals: {
            lock: async (proposalId) => {
              const [locked] = await tx
                .select({ status: proposal.status })
                .from(proposal)
                .where(eq(proposal.id, proposalId))
                .for("update");
              return ProposalStatus.parse(locked?.status);
            },
            lockBatch: async (batchId) => {
              const rows = await tx
                .select({ id: proposal.id, status: proposal.status })
                .from(proposal)
                .where(eq(proposal.batchId, batchId))
                .for("update");
              return rows.map(({ id, status }) => ({
                id,
                status: ProposalStatus.parse(status),
              }));
            },
            settle: async (proposalId, status) => {
              const before = await tx.select().from(proposal).where(eq(proposal.id, proposalId));
              const after = await tx
                .update(proposal)
                .set({ status })
                .where(eq(proposal.id, proposalId))
                .returning();
              await resize(storageMeterOn(tx), { before, after });
            },
          },
          tokens: validatedTokenWriterOn(tx),
          figmaStates: figmaStateOn(tx),
          history: historyWriterOn(tx),
        });
        if (!outcome.ok) {
          throw new RolledBack(outcome);
        }
        return outcome;
      })
      .catch((error: unknown) => {
        if (error instanceof RolledBack) {
          return error.failure;
        }
        throw error;
      });
  },
});
