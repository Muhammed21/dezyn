import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { schema } from "@repo/db";

import type { PostgresDatabase, PostgresTransaction } from "../../../platform/postgres-database.ts";
import type { HistoryWriter } from "../../history/contracts/history-writer.ts";
import type { ModeReader, ProjectTokenReader, TokenUnitOfWork } from "../application/add-token.ts";
import type { ValidatedTokenReader } from "../application/read-tokens.ts";

const { mode, modifier, token, tokenValue } = schema;

export const postgresProjectTokenReader = (db: PostgresDatabase): ProjectTokenReader => ({
  tokensOf: (projectId) =>
    db.orm
      .select({ id: token.id, name: token.name, $type: token.type, status: token.status })
      .from(token)
      .where(eq(token.projectId, projectId)),
});

export const postgresModeReader = (db: PostgresDatabase): ModeReader => ({
  modesOf: (projectId) =>
    db.orm
      .select({ id: mode.id, name: mode.name })
      .from(mode)
      .innerJoin(modifier, eq(modifier.id, mode.modifierId))
      .where(eq(modifier.projectId, projectId))
      .orderBy(asc(mode.position)),
});

export const postgresTokenUnitOfWork = ({
  db,
  historyWriterOn,
  newId,
}: {
  readonly db: PostgresDatabase;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
  readonly newId: () => string;
}): TokenUnitOfWork => ({
  run: (work) =>
    db.orm.transaction((tx) =>
      work({
        tokens: {
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
            await tx.insert(tokenValue).values(
              values.map(({ modeId, value, referencedTokenId }) => ({
                id: newId(),
                tokenId: added.id,
                modeId,
                value,
                referencedTokenId,
              })),
            );
            return "created";
          },
        },
        history: historyWriterOn(tx),
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
