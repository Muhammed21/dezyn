import { randomUUID } from "node:crypto";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import type { StorageMeter } from "#modules/project/contracts/storage-meter.ts";
import type { ProjectAccess } from "#modules/space/contracts/membership.ts";

import { purgeHistory } from "./application/purge-history.ts";
import { readHistory } from "./application/read-history.ts";
import { recordProjectCall } from "./application/record-project-call.ts";
import type { HistoryWriter } from "./domain/history-writer.ts";
import {
  postgresPurgeCandidates,
  postgresPurgeLock,
  postgresPurgeUnitOfWork,
} from "./infrastructure/postgres-history-purge.ts";
import { postgresHistoryReader } from "./infrastructure/postgres-history-reader.ts";
import { postgresHistoryWriter } from "./infrastructure/postgres-history-writer.ts";

export const historyWriterOn = (tx: PostgresTransaction, meter: StorageMeter) =>
  postgresHistoryWriter(tx, { newId: randomUUID, meter });

const now = () => new Date();

const PURGE_BUDGET_MS = 30_000;

export const purgeLockOn = postgresPurgeLock;

export const historyPurge = ({
  db,
  meterOn,
  now: clock = now,
}: {
  readonly db: PostgresDatabase;
  readonly meterOn: (tx: PostgresTransaction) => StorageMeter;
  readonly now?: () => Date;
}) =>
  purgeHistory({
    candidates: postgresPurgeCandidates(db),
    unitOfWork: postgresPurgeUnitOfWork({ db, meterOn }),
    now: clock,
    budgetMs: PURGE_BUDGET_MS,
  });

export const historyModule = ({
  db,
  access,
  writerOn,
}: {
  readonly db: PostgresDatabase;
  readonly access: ProjectAccess;
  readonly writerOn: (tx: PostgresTransaction) => HistoryWriter;
}) => ({
  readHistory: readHistory({ access, history: postgresHistoryReader(db) }),
  recordProjectCall: recordProjectCall({
    access,
    history: { append: (entry) => db.orm.transaction((tx) => writerOn(tx).append(entry)) },
    now,
  }),
});
