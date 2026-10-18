import { asc, eq } from "drizzle-orm";

import { schema } from "@repo/db";

import type { PostgresDatabase, PostgresTransaction } from "../../../platform/postgres-database.ts";
import type { HistoryWriter } from "../../history/contracts/history-writer.ts";
import type { ModeReader, TokenUnitOfWork } from "../application/add-token.ts";

const { mode, modifier, token, tokenValue } = schema;

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
              values.map(({ modeId, value }) => ({
                id: newId(),
                tokenId: added.id,
                modeId,
                value,
              })),
            );
            return "created";
          },
        },
        history: historyWriterOn(tx),
      }),
    ),
});
