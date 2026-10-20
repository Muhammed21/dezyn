import { asc, eq } from "drizzle-orm";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import { schema } from "@repo/db";

import type { ProjectUnitOfWork } from "../application/create-project.ts";
import type { ProjectLister } from "../application/list-projects.ts";
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

export const postgresProjectLister = (db: PostgresDatabase): ProjectLister => ({
  projectsOf: (spaceId) =>
    db.orm
      .select({ id: project.id, name: project.name, createdAt: project.createdAt })
      .from(project)
      .where(eq(project.spaceId, spaceId))
      .orderBy(asc(project.name)),
});
