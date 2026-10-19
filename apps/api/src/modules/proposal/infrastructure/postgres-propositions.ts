import { and, eq } from "drizzle-orm";

import { schema } from "@repo/db";

import type { PostgresDatabase, PostgresTransaction } from "../../../platform/postgres-database.ts";
import type { PropositionUnitOfWork, Writer } from "../application/write-tokens.ts";
import type { PropositionLot } from "../domain/proposition.ts";

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

export const postgresPropositionUnitOfWork = (db: PostgresDatabase): PropositionUnitOfWork => ({
  run: (work) =>
    db.orm.transaction((tx) =>
      work({
        openLotOf: async (candidate) => {
          await tx.insert(propositionLot).values(candidate).onConflictDoNothing();
          return (await findOpenLot(tx, candidate)) ?? candidate;
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
