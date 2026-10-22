import { eq, sql } from "drizzle-orm";

import type { PostgresTransaction } from "#db";
import { schema } from "@repo/db";

import { type StorageMeter, storedSize } from "../domain/storage.ts";

const { project } = schema;

const sizeOfRows = (rows: readonly object[]) =>
  rows.reduce((total, row) => total + storedSize(row), 0);

export const postgresStorageMeter = (tx: PostgresTransaction): StorageMeter => {
  const shift = (projectId: string, bytes: number) =>
    tx
      .update(project)
      .set({ storedBytes: sql`${project.storedBytes} + ${bytes}` })
      .where(eq(project.id, projectId));
  return {
    add: async (projectId, rows) => {
      await shift(projectId, sizeOfRows(rows));
    },
    remove: async (projectId, rows) => {
      await shift(projectId, -sizeOfRows(rows));
    },
  };
};
