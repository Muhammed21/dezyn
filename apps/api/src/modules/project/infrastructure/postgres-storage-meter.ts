import { eq, sql } from "drizzle-orm";

import type { PostgresTransaction } from "#db";
import { schema } from "@repo/db";

import { type StorageMeter, storedSize } from "../domain/storage.ts";

const { project } = schema;

export const postgresStorageMeter = (tx: PostgresTransaction): StorageMeter => ({
  add: async (projectId, rows) => {
    const bytes = rows.reduce((total, row) => total + storedSize(row), 0);
    await tx
      .update(project)
      .set({ storedBytes: sql`${project.storedBytes} + ${bytes}` })
      .where(eq(project.id, projectId));
  },
});
