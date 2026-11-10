import { eq } from "drizzle-orm";

import type { PostgresTransaction } from "#db";
import { schema } from "@repo/db";

import type { ProjectLock } from "../domain/project-lock.ts";

const { project } = schema;

export const postgresProjectLock = (tx: PostgresTransaction): ProjectLock => ({
  write: async (projectId) => {
    await tx.select().from(project).where(eq(project.id, projectId)).for("no key update");
  },
  exclusive: async (projectId) => {
    await tx.select().from(project).where(eq(project.id, projectId)).for("update");
  },
});
