import { eq } from "drizzle-orm";

import { schema } from "@repo/db";

import type { PostgresDatabase, PostgresTransaction } from "../../../platform/postgres-database.ts";
import type { HistoryWriter } from "../../history/contracts/history-writer.ts";
import type { ProjectUnitOfWork } from "../application/create-project.ts";
import type { ProjectFinder } from "../domain/project.ts";

const { project } = schema;

export const postgresProjectUnitOfWork = ({
  db,
  historyWriterOn,
}: {
  readonly db: PostgresDatabase;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
}): ProjectUnitOfWork => ({
  run: (work) =>
    db.orm.transaction((tx) =>
      work({
        projects: {
          create: async (created) => {
            await tx.insert(project).values(created);
          },
        },
        history: historyWriterOn(tx),
      }),
    ),
});

export const postgresProjectFinder = (db: PostgresDatabase): ProjectFinder => ({
  find: async (projectId) => {
    const [row] = await db.orm
      .select({ id: project.id, spaceId: project.spaceId })
      .from(project)
      .where(eq(project.id, projectId));
    return row;
  },
});
