import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { StorageMeter } from "#modules/project/contracts/storage-meter.ts";
import type { StorageAlertDecision } from "#modules/space/contracts/storage-alert.ts";
import { schema } from "@repo/db";
import type { Err, Result } from "@repo/result";

import type { PendingProposals, TokenUnitOfWork } from "../application/add-token.ts";
import type {
  FigmaProposals,
  FigmaStateWriter,
  FigmaUnitOfWork,
  RejectedValueReader,
} from "../application/declare-figma-states.ts";
import type { ModifierReader } from "../application/export-tokens.ts";
import type { TokenImportUnit, TokenImportUnitOfWork } from "../application/import-tokens.ts";
import type { FigmaStateReader, ValidatedTokenReader } from "../application/read-tokens.ts";
import type {
  ModeReader,
  ModeValue,
  ProjectTokenReader,
  TokenWriter,
} from "../application/token-values.ts";
import type { ComparedDefinition } from "../domain/same-definition.ts";

const { identityUser, mode, modifier, token, tokenFigmaState, tokenValue, tokenValueReference } =
  schema;

type Queryable = Pick<PostgresTransaction, "select" | "insert" | "update" | "delete">;

export const postgresProjectTokenReader = (orm: Queryable): ProjectTokenReader => ({
  tokensOf: (projectId) =>
    orm
      .select({ id: token.id, name: token.name, $type: token.type, status: token.status })
      .from(token)
      .where(eq(token.projectId, projectId)),
});

export const postgresModifierReader = (orm: Queryable): ModifierReader => ({
  modifierOf: async (projectId) => {
    const [row] = await orm
      .select({ name: modifier.name })
      .from(modifier)
      .where(eq(modifier.projectId, projectId));
    return row?.name;
  },
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
  const rows = values.map((stored) => ({ id: newId(), stored }));
  const writtenValues = await tx
    .insert(tokenValue)
    .values(
      rows.map(({ id, stored: { modeId, value, referencedTokenId } }) => ({
        id,
        tokenId,
        modeId,
        value,
        referencedTokenId,
      })),
    )
    .returning();
  const references = rows.flatMap(({ id, stored }) =>
    stored.fieldReferences.map(({ field, referencedTokenId }) => ({
      id: newId(),
      tokenValueId: id,
      field,
      referencedTokenId,
    })),
  );
  if (references.length === 0) {
    return writtenValues;
  }
  const writtenReferences = await tx.insert(tokenValueReference).values(references).returning();
  return [...writtenValues, ...writtenReferences];
};

export const postgresTokenWriter = (
  tx: Queryable,
  { newId, meter }: { readonly newId: () => string; readonly meter: StorageMeter },
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
        extensions: added.$extensions ?? null,
        status: added.status,
        createdAt: added.createdAt,
      })
      .onConflictDoNothing({ target: [token.projectId, token.name] })
      .returning();
    if (inserted.length === 0) {
      return "name_taken";
    }
    const written = await insertValues(tx, { newId, tokenId: added.id, values });
    await meter.add(added.projectId, [...inserted, ...written]);
    return "created";
  },
  replace: async (replaced, values) => {
    const [before] = await tx
      .select()
      .from(token)
      .where(and(eq(token.projectId, replaced.projectId), eq(token.name, replaced.name)));
    if (before === undefined) {
      return;
    }
    const updated = await tx
      .update(token)
      .set({
        description: replaced.$description ?? null,
        extensions: replaced.$extensions ?? null,
      })
      .where(eq(token.id, before.id))
      .returning();
    const removedReferences = await tx
      .select({ row: tokenValueReference })
      .from(tokenValueReference)
      .innerJoin(tokenValue, eq(tokenValue.id, tokenValueReference.tokenValueId))
      .where(eq(tokenValue.tokenId, before.id));
    const removedValues = await tx
      .delete(tokenValue)
      .where(eq(tokenValue.tokenId, before.id))
      .returning();
    const written = await insertValues(tx, { newId, tokenId: before.id, values });
    await meter.remove(replaced.projectId, [
      before,
      ...removedValues,
      ...removedReferences.map(({ row }) => row),
    ]);
    await meter.add(replaced.projectId, [...updated, ...written]);
  },
});

export const postgresTokenUnitOfWork = ({
  db,
  historyWriterOn,
  proposalReplacerOn,
  storageMeterOn,
  storageAlertOn,
  newId,
}: {
  readonly db: PostgresDatabase;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
  readonly storageMeterOn: (tx: PostgresTransaction) => StorageMeter;
  readonly proposalReplacerOn: (tx: PostgresTransaction) => PendingProposals;
  readonly storageAlertOn: (tx: PostgresTransaction) => StorageAlertDecision;
  readonly newId: () => string;
}): TokenUnitOfWork => ({
  run: (work) =>
    db.orm.transaction((tx) =>
      work({
        tokens: postgresTokenWriter(tx, { newId, meter: storageMeterOn(tx) }),
        history: historyWriterOn(tx),
        proposals: proposalReplacerOn(tx),
        storageAlert: storageAlertOn(tx),
      }),
    ),
});

export const postgresTokenImportUnitOfWork = ({
  db,
  historyWriterOn,
  proposalReplacerOn,
  storageMeterOn,
  newId,
}: {
  readonly db: PostgresDatabase;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
  readonly storageMeterOn: (tx: PostgresTransaction) => StorageMeter;
  readonly proposalReplacerOn: (tx: PostgresTransaction) => PendingProposals;
  readonly newId: () => string;
}): TokenImportUnitOfWork => ({
  async run<T, E>(work: (unit: TokenImportUnit) => Promise<Result<T, E>>): Promise<Result<T, E>> {
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
          tokens: postgresTokenWriter(tx, { newId, meter: storageMeterOn(tx) }),
          history: historyWriterOn(tx),
          proposals: proposalReplacerOn(tx),
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

const referenced = alias(token, "referenced");

export const postgresValidatedTokenReader = (db: PostgresDatabase): ValidatedTokenReader => ({
  validatedValuesOf: (projectId) =>
    db.orm
      .select({
        tokenId: token.id,
        name: token.name,
        $type: token.type,
        $description: token.description,
        $extensions: token.extensions,
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

export const postgresFigmaStateWriter = (tx: Queryable, meter: StorageMeter): FigmaStateWriter => ({
  declare: async ({ projectId, states, declaredAt, userId, clientId }) => {
    const tokenIds = states.map(({ tokenId }) => tokenId);
    await tx
      .select({ id: token.id })
      .from(token)
      .where(inArray(token.id, tokenIds))
      .for("no key update");
    const before = await tx
      .select()
      .from(tokenFigmaState)
      .where(inArray(tokenFigmaState.tokenId, tokenIds))
      .for("update");
    const after = await tx
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
      })
      .returning();
    await meter.remove(projectId, before);
    await meter.add(projectId, after);
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
  storageMeterOn,
  storageAlertOn,
}: {
  readonly db: PostgresDatabase;
  readonly proposalWriterOn: (tx: PostgresTransaction) => FigmaProposals;
  readonly storageMeterOn: (tx: PostgresTransaction) => StorageMeter;
  readonly storageAlertOn: (tx: PostgresTransaction) => StorageAlertDecision;
}): FigmaUnitOfWork => ({
  run: (work) =>
    db.orm.transaction((tx) =>
      work({
        figmaStates: postgresFigmaStateWriter(tx, storageMeterOn(tx)),
        proposals: proposalWriterOn(tx),
        storageAlert: storageAlertOn(tx),
      }),
    ),
});

const resizeFigmaStateOf = async (
  tx: Queryable,
  {
    meter,
    proposalId,
    change,
  }: {
    readonly meter: StorageMeter;
    readonly proposalId: string;
    readonly change: Partial<typeof tokenFigmaState.$inferInsert>;
  },
) => {
  const before = await tx
    .select({ row: tokenFigmaState, projectId: token.projectId })
    .from(tokenFigmaState)
    .innerJoin(token, eq(token.id, tokenFigmaState.tokenId))
    .where(eq(tokenFigmaState.proposalId, proposalId))
    .for("update", { of: tokenFigmaState });
  const after = await tx
    .update(tokenFigmaState)
    .set(change)
    .where(eq(tokenFigmaState.proposalId, proposalId))
    .returning();
  const [changed] = before;
  if (changed === undefined) {
    return;
  }
  await meter.remove(
    changed.projectId,
    before.map(({ row }) => row),
  );
  await meter.add(changed.projectId, after);
};

export const postgresFigmaStateSynchronizer = (tx: Queryable, meter: StorageMeter) => ({
  proposalValidated: async (proposalId: string) => {
    await resizeFigmaStateOf(tx, {
      meter,
      proposalId,
      change: { state: "synced", proposalId: null },
    });
  },
  proposalRejected: async ({
    proposalId,
    token: { $value, modes },
  }: {
    readonly proposalId: string;
    readonly token: ComparedDefinition;
  }) => {
    await resizeFigmaStateOf(tx, {
      meter,
      proposalId,
      change: { rejectedValue: { $value, modes }, proposalId: null },
    });
  },
});

const RejectedValue = z.object({
  $value: z.unknown().optional(),
  modes: z.record(z.string(), z.unknown()).optional(),
});

export const postgresRejectedValueReader = (db: PostgresDatabase): RejectedValueReader => ({
  rejectedValuesOf: async (projectId) => {
    const rows = await db.orm
      .select({ tokenId: tokenFigmaState.tokenId, rejectedValue: tokenFigmaState.rejectedValue })
      .from(tokenFigmaState)
      .innerJoin(token, eq(token.id, tokenFigmaState.tokenId))
      .where(and(eq(token.projectId, projectId), isNotNull(tokenFigmaState.rejectedValue)));
    return rows.map(({ tokenId, rejectedValue }) => ({
      tokenId,
      rejected: RejectedValue.parse(rejectedValue),
    }));
  },
});
