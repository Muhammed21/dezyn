import { eq } from "drizzle-orm";

import type { PostgresDatabase } from "#db";
import { storedSize } from "#modules/project/domain/storage.ts";
import { schema } from "@repo/db";

const { historyEntry, project, proposal, proposalBatch, token, tokenValue, tokenValueReference } =
  schema;

export const seedStoredBytes = (
  db: PostgresDatabase,
  { projectId, bytes }: { readonly projectId: string; readonly bytes: number },
) => db.orm.update(project).set({ storedBytes: bytes }).where(eq(project.id, projectId));

export const storedBytesOf = async (db: PostgresDatabase, projectId: string) => {
  const [row] = await db.orm
    .select({ storedBytes: project.storedBytes })
    .from(project)
    .where(eq(project.id, projectId));
  return row?.storedBytes;
};

const sizeOfRows = (rows: readonly object[]) =>
  rows.reduce((total, row) => total + storedSize(row), 0);

export const bytesOfTokenRows = async (db: PostgresDatabase, projectId: string) => {
  const tokens = await db.orm.select().from(token).where(eq(token.projectId, projectId));
  const values = await db.orm
    .select({ row: tokenValue })
    .from(tokenValue)
    .innerJoin(token, eq(token.id, tokenValue.tokenId))
    .where(eq(token.projectId, projectId));
  const references = await db.orm
    .select({ row: tokenValueReference })
    .from(tokenValueReference)
    .innerJoin(tokenValue, eq(tokenValue.id, tokenValueReference.tokenValueId))
    .innerJoin(token, eq(token.id, tokenValue.tokenId))
    .where(eq(token.projectId, projectId));
  return (
    sizeOfRows(tokens) +
    sizeOfRows(values.map(({ row }) => row)) +
    sizeOfRows(references.map(({ row }) => row))
  );
};

export const bytesOfProjectRows = async (db: PostgresDatabase, projectId: string) => {
  const batches = await db.orm
    .select()
    .from(proposalBatch)
    .where(eq(proposalBatch.projectId, projectId));
  const proposals = await db.orm.select().from(proposal).where(eq(proposal.projectId, projectId));
  const entries = await db.orm
    .select()
    .from(historyEntry)
    .where(eq(historyEntry.projectId, projectId));
  return (
    (await bytesOfTokenRows(db, projectId)) +
    sizeOfRows(batches) +
    sizeOfRows(proposals) +
    sizeOfRows(entries)
  );
};
