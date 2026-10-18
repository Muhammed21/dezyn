import { randomUUID } from "node:crypto";

import type { PostgresDatabase, PostgresTransaction } from "../../platform/postgres-database.ts";
import type { ProjectFinder } from "../project/contracts/project.ts";
import type { MembershipReader } from "../space/contracts/membership.ts";
import { auditProjectCall } from "./application/audit-project-call.ts";
import { readHistory } from "./application/read-history.ts";
import type { HistoryWriter } from "./domain/history-writer.ts";
import { postgresHistoryReader } from "./infrastructure/postgres-history-reader.ts";
import { postgresHistoryWriter } from "./infrastructure/postgres-history-writer.ts";

export const historyWriterOn = (tx: PostgresTransaction) =>
  postgresHistoryWriter(tx, { newId: randomUUID });

const now = () => new Date();

export const historyModule = ({
  db,
  memberships,
  projects,
  writerOn,
}: {
  readonly db: PostgresDatabase;
  readonly memberships: MembershipReader;
  readonly projects: ProjectFinder;
  readonly writerOn: (tx: PostgresTransaction) => HistoryWriter;
}) => ({
  readHistory: readHistory({ projects, memberships, history: postgresHistoryReader(db) }),
  auditProjectCall: auditProjectCall({
    projects,
    memberships,
    history: { append: (entry) => db.orm.transaction((tx) => writerOn(tx).append(entry)) },
    now,
  }),
});
