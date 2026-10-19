import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { schema } from "@repo/db";

import type { PostgresDatabase, PostgresTransaction } from "../../../platform/postgres-database.ts";
import type { HistoryWriter } from "../../history/contracts/history-writer.ts";
import { TokenDefinitionInput } from "../../token/contracts/token-definition.ts";
import type { ValidatedTokenWriter } from "../../token/contracts/token-issues.ts";
import type { PropositionReader, ReviewUnitOfWork } from "../application/review-propositions.ts";
import type { PropositionUnitOfWork, Writer } from "../application/write-tokens.ts";
import type { Proposition, PropositionLot } from "../domain/proposition.ts";

const { proposition, propositionLot } = schema;

const findOpenLot = async (
  tx: PostgresTransaction,
  { projectId, userId, clientId }: Writer,
): Promise<PropositionLot | undefined> => {
  const [lot] = await tx
    .select()
    .from(propositionLot)
    .where(
      and(
        eq(propositionLot.projectId, projectId),
        eq(propositionLot.userId, userId),
        eq(propositionLot.clientId, clientId),
        eq(propositionLot.state, "open"),
      ),
    );
  return lot === undefined ? undefined : { ...lot, state: "open" };
};

export const postgresPropositionReplacer = (tx: PostgresTransaction) => ({
  replace: async ({ projectId, name }: { readonly projectId: string; readonly name: string }) => {
    const [replaced] = await tx
      .update(proposition)
      .set({ status: "replaced" })
      .where(
        and(
          eq(proposition.tokenName, name),
          eq(proposition.status, "proposed"),
          inArray(
            proposition.lotId,
            tx
              .select({ id: propositionLot.id })
              .from(propositionLot)
              .where(eq(propositionLot.projectId, projectId)),
          ),
        ),
      )
      .returning({ id: proposition.id, lotId: proposition.lotId });
    return replaced ?? null;
  },
});

export const postgresPropositionUnitOfWork = (db: PostgresDatabase): PropositionUnitOfWork => ({
  run: (work) =>
    db.orm.transaction((tx) =>
      work({
        pendingOf: async (projectId, names) => {
          const rows = await tx
            .select({ proposition })
            .from(proposition)
            .innerJoin(propositionLot, eq(propositionLot.id, proposition.lotId))
            .where(
              and(
                eq(propositionLot.projectId, projectId),
                eq(proposition.status, "proposed"),
                inArray(proposition.tokenName, [...names]),
              ),
            )
            .for("update", { of: proposition });
          return rows.map((row) => propositionOf(row.proposition));
        },
        replace: async (propositionIds) => {
          await tx
            .update(proposition)
            .set({ status: "replaced" })
            .where(inArray(proposition.id, [...propositionIds]));
        },
        findOpenLot: (writer) => findOpenLot(tx, writer),
        openLotOf: async (candidate) => {
          await tx.insert(propositionLot).values(candidate).onConflictDoNothing();
          return (await findOpenLot(tx, candidate)) ?? candidate;
        },
        closeLot: async (lotId) => {
          await tx
            .update(propositionLot)
            .set({ state: "closed" })
            .where(eq(propositionLot.id, lotId));
        },
        touchLot: async (lotId, lastWrittenAt) => {
          await tx
            .update(propositionLot)
            .set({ lastWrittenAt })
            .where(eq(propositionLot.id, lotId));
        },
        propose: async (propositions) => {
          await tx.insert(proposition).values(
            propositions.map(({ id, lotId, name, kind, token, status, createdAt }) => ({
              id,
              lotId,
              tokenName: name,
              kind,
              payload: token,
              status,
              createdAt,
            })),
          );
        },
      }),
    ),
});

const LotState = z.enum(["open", "closed"]);

const PropositionStatus = z.enum(["proposed", "validated", "rejected", "replaced"]);

const PropositionRow = z.object({
  id: z.string(),
  lotId: z.string(),
  tokenName: z.string(),
  kind: z.enum(["create", "update"]),
  payload: TokenDefinitionInput,
  status: PropositionStatus,
  createdAt: z.date(),
});

const propositionOf = (row: unknown): Proposition => {
  const { tokenName, payload, ...parsed } = PropositionRow.parse(row);
  return { ...parsed, name: tokenName, token: payload };
};

const lotOf = ({ state, ...lot }: typeof propositionLot.$inferSelect): PropositionLot => ({
  ...lot,
  state: LotState.parse(state),
});

export const postgresPropositionReader = (db: PostgresDatabase): PropositionReader => ({
  batchesOf: async (projectId) => {
    const rows = await db.orm
      .select({
        id: propositionLot.id,
        intention: propositionLot.intention,
        state: propositionLot.state,
        lastWrittenAt: propositionLot.lastWrittenAt,
        toReview: count(proposition.id),
      })
      .from(propositionLot)
      .leftJoin(
        proposition,
        and(eq(proposition.lotId, propositionLot.id), eq(proposition.status, "proposed")),
      )
      .where(eq(propositionLot.projectId, projectId))
      .groupBy(propositionLot.id)
      .orderBy(desc(propositionLot.openedAt), desc(propositionLot.id));
    return rows.map(({ state, ...row }) => ({ ...row, state: LotState.parse(state) }));
  },
  batch: async (batchId) => {
    const [lot] = await db.orm.select().from(propositionLot).where(eq(propositionLot.id, batchId));
    if (lot === undefined) {
      return undefined;
    }
    const rows = await db.orm
      .select()
      .from(proposition)
      .where(eq(proposition.lotId, batchId))
      .orderBy(asc(proposition.createdAt), asc(proposition.id));
    return { ...lotOf(lot), propositions: rows.map(propositionOf) };
  },
  pendingTokensOf: async (projectId) => {
    const rows = await db.orm
      .select({ proposition })
      .from(proposition)
      .innerJoin(propositionLot, eq(propositionLot.id, proposition.lotId))
      .where(and(eq(propositionLot.projectId, projectId), eq(proposition.status, "proposed")));
    return rows.map((row) => {
      const { name, $type } = propositionOf(row.proposition).token;
      return { name, $type };
    });
  },
  proposition: async (propositionId) => {
    const [row] = await db.orm
      .select({ proposition, projectId: propositionLot.projectId })
      .from(proposition)
      .innerJoin(propositionLot, eq(propositionLot.id, proposition.lotId))
      .where(eq(proposition.id, propositionId));
    return row === undefined
      ? undefined
      : { proposition: propositionOf(row.proposition), projectId: row.projectId };
  },
});

export const postgresReviewUnitOfWork = ({
  db,
  historyWriterOn,
  validatedTokenWriterOn,
}: {
  readonly db: PostgresDatabase;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
  readonly validatedTokenWriterOn: (tx: PostgresTransaction) => ValidatedTokenWriter;
}): ReviewUnitOfWork => ({
  run: (work) =>
    db.orm.transaction((tx) =>
      work({
        propositions: {
          lock: async (propositionId) => {
            const [locked] = await tx
              .select({ status: proposition.status })
              .from(proposition)
              .where(eq(proposition.id, propositionId))
              .for("update");
            return PropositionStatus.parse(locked?.status);
          },
          settle: async (propositionId, status) => {
            await tx.update(proposition).set({ status }).where(eq(proposition.id, propositionId));
          },
        },
        tokens: validatedTokenWriterOn(tx),
        history: historyWriterOn(tx),
      }),
    ),
});
