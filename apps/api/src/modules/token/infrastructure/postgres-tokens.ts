import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { schema } from "@repo/db";

import type { PostgresDatabase, PostgresTransaction } from "../../../platform/postgres-database.ts";
import type { HistoryWriter } from "../../history/contracts/history-writer.ts";
import type {
  ModeReader,
  ModeValue,
  PendingProposals,
  ProjectTokenReader,
  TokenUnitOfWork,
  TokenWriter,
} from "../application/add-token.ts";
import type { ValidatedTokenReader } from "../application/read-tokens.ts";

const { mode, modifier, token, tokenValue } = schema;

type Queryable = Pick<PostgresTransaction, "select" | "insert" | "update" | "delete">;

export const postgresProjectTokenReader = (orm: Queryable): ProjectTokenReader => ({
  tokensOf: (projectId) =>
    orm
      .select({ id: token.id, name: token.name, $type: token.type, status: token.status })
      .from(token)
      .where(eq(token.projectId, projectId)),
});

export const postgresModeReader = (orm: Queryable): ModeReader => ({
  modesOf: (projectId) =>
    orm
      .select({ id: mode.id, name: mode.name })
      .from(mode)
      .innerJoin(modifier, eq(modifier.id, mode.modifierId))
      .where(eq(modifier.projectId, projectId))
      .orderBy(asc(mode.position)),
});

const insertValues = async (
  tx: Queryable,
  {
    newId,
    tokenId,
    values,
  }: {
    readonly newId: () => string;
    readonly tokenId: string;
    readonly values: readonly ModeValue[];
  },
) => {
  await tx.insert(tokenValue).values(
    values.map(({ modeId, value, referencedTokenId }) => ({
      id: newId(),
      tokenId,
      modeId,
      value,
      referencedTokenId,
    })),
  );
};

export const postgresTokenWriter = (
  tx: Queryable,
  { newId }: { readonly newId: () => string },
): TokenWriter => ({
  create: async (added, values) => {
    const inserted = await tx
      .insert(token)
      .values({
        id: added.id,
        projectId: added.projectId,
        name: added.name,
        type: added.$type,
        description: added.$description ?? null,
        status: added.status,
        createdAt: added.createdAt,
      })
      .onConflictDoNothing({ target: [token.projectId, token.name] })
      .returning({ id: token.id });
    if (inserted.length === 0) {
      return "name_taken";
    }
    await insertValues(tx, { newId, tokenId: added.id, values });
    return "created";
  },
  replace: async (replaced, values) => {
    const [updated] = await tx
      .update(token)
      .set({ description: replaced.$description ?? null })
      .where(and(eq(token.projectId, replaced.projectId), eq(token.name, replaced.name)))
      .returning({ id: token.id });
    if (updated === undefined) {
      return;
    }
    await tx.delete(tokenValue).where(eq(tokenValue.tokenId, updated.id));
    await insertValues(tx, { newId, tokenId: updated.id, values });
  },
});

export const postgresTokenUnitOfWork = ({
  db,
  historyWriterOn,
  proposalReplacerOn,
  newId,
}: {
  readonly db: PostgresDatabase;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
  readonly proposalReplacerOn: (tx: PostgresTransaction) => PendingProposals;
  readonly newId: () => string;
}): TokenUnitOfWork => ({
  run: (work) =>
    db.orm.transaction((tx) =>
      work({
        tokens: postgresTokenWriter(tx, { newId }),
        history: historyWriterOn(tx),
        proposals: proposalReplacerOn(tx),
      }),
    ),
});

const referenced = alias(token, "referenced");

export const postgresValidatedTokenReader = (db: PostgresDatabase): ValidatedTokenReader => ({
  validatedValuesOf: (projectId) =>
    db.orm
      .select({
        tokenId: token.id,
        name: token.name,
        $type: token.type,
        $description: token.description,
        mode: mode.name,
        value: tokenValue.value,
        referencedName: referenced.name,
      })
      .from(token)
      .innerJoin(tokenValue, eq(tokenValue.tokenId, token.id))
      .leftJoin(mode, eq(mode.id, tokenValue.modeId))
      .leftJoin(referenced, eq(referenced.id, tokenValue.referencedTokenId))
      .where(and(eq(token.projectId, projectId), eq(token.status, "validated")))
      .orderBy(asc(token.name), asc(mode.position)),
});
