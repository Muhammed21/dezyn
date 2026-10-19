import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import { schema } from "@repo/db";

import type {
  ModeReader,
  ModeValue,
  PendingProposals,
  ProjectTokenReader,
  TokenUnitOfWork,
  TokenWriter,
} from "../application/add-token.ts";
import type {
  FigmaProposals,
  FigmaStateWriter,
  FigmaUnitOfWork,
  RejectedValueReader,
} from "../application/declare-figma-states.ts";
import type { FigmaStateReader, ValidatedTokenReader } from "../application/read-tokens.ts";
import type { ComparedDefinition } from "../domain/same-definition.ts";

const { identityUser, mode, modifier, token, tokenFigmaState, tokenValue } = schema;

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

export const postgresFigmaStateWriter = (tx: Queryable): FigmaStateWriter => ({
  declare: async ({ states, declaredAt, userId, clientId }) => {
    await tx
      .insert(tokenFigmaState)
      .values(
        states.map((declared) => ({
          tokenId: declared.tokenId,
          state: declared.state,
          figmaVariables: declared.state === "duplicate_in_figma" ? declared.figmaVariables : null,
          proposalId: declared.proposalId,
          declaredAt,
          userId,
          clientId,
        })),
      )
      .onConflictDoUpdate({
        target: tokenFigmaState.tokenId,
        set: {
          state: sql`excluded.state`,
          figmaVariables: sql`excluded.figma_variables`,
          declaredAt: sql`excluded.declared_at`,
          userId: sql`excluded.user_id`,
          clientId: sql`excluded.client_id`,
          proposalId: sql`case when excluded.state = 'diverged' then coalesce(excluded.proposal_id, ${tokenFigmaState.proposalId}) end`,
        },
      });
  },
});

const FigmaState = z.enum(["synced", "missing_in_figma", "duplicate_in_figma", "diverged"]);

const FigmaVariables = z.array(z.string()).nullable();

export const postgresFigmaStateReader = (db: PostgresDatabase): FigmaStateReader => ({
  figmaStatesOf: async (projectId) => {
    const rows = await db.orm
      .select({
        tokenId: tokenFigmaState.tokenId,
        state: tokenFigmaState.state,
        figmaVariables: tokenFigmaState.figmaVariables,
        declaredAt: tokenFigmaState.declaredAt,
        userId: tokenFigmaState.userId,
        name: identityUser.name,
        clientId: tokenFigmaState.clientId,
      })
      .from(tokenFigmaState)
      .innerJoin(token, eq(token.id, tokenFigmaState.tokenId))
      .innerJoin(identityUser, eq(identityUser.id, tokenFigmaState.userId))
      .where(eq(token.projectId, projectId));
    return rows.map(({ tokenId, state, figmaVariables, declaredAt, userId, name, clientId }) => {
      const variables = FigmaVariables.parse(figmaVariables);
      return {
        tokenId,
        state: FigmaState.parse(state),
        ...(variables === null ? {} : { figmaVariables: variables }),
        declaredAt,
        author: { kind: "member", userId, name },
        clientId,
      };
    });
  },
});

export const postgresFigmaUnitOfWork = ({
  db,
  proposalWriterOn,
}: {
  readonly db: PostgresDatabase;
  readonly proposalWriterOn: (tx: PostgresTransaction) => FigmaProposals;
}): FigmaUnitOfWork => ({
  run: (work) =>
    db.orm.transaction((tx) =>
      work({ figmaStates: postgresFigmaStateWriter(tx), proposals: proposalWriterOn(tx) }),
    ),
});

export const postgresFigmaStateSynchronizer = (tx: Queryable) => ({
  proposalValidated: async (proposalId: string) => {
    await tx
      .update(tokenFigmaState)
      .set({ state: "synced", proposalId: null })
      .where(eq(tokenFigmaState.proposalId, proposalId));
  },
  proposalRejected: async ({
    proposalId,
    token: { $value, modes },
  }: {
    readonly proposalId: string;
    readonly token: ComparedDefinition;
  }) => {
    await tx
      .update(tokenFigmaState)
      .set({ rejectedValue: { $value, modes }, proposalId: null })
      .where(eq(tokenFigmaState.proposalId, proposalId));
  },
});

const RejectedValue = z
  .object({
    $value: z.unknown().optional(),
    modes: z.record(z.string(), z.unknown()).optional(),
  })
  .nullable();

export const postgresRejectedValueReader = (db: PostgresDatabase): RejectedValueReader => ({
  rejectedValuesOf: async (projectId) => {
    const rows = await db.orm
      .select({ tokenId: tokenFigmaState.tokenId, rejectedValue: tokenFigmaState.rejectedValue })
      .from(tokenFigmaState)
      .innerJoin(token, eq(token.id, tokenFigmaState.tokenId))
      .where(eq(token.projectId, projectId));
    return rows.flatMap(({ tokenId, rejectedValue }) => {
      const rejected = RejectedValue.parse(rejectedValue);
      return rejected === null ? [] : [{ tokenId, rejected }];
    });
  },
});
