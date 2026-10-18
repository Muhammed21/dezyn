import { randomUUID } from "node:crypto";

import type { PostgresDatabase, PostgresTransaction } from "../../platform/postgres-database.ts";
import type { ProjectFinder } from "../project/contracts/project.ts";
import type { MembershipReader } from "../space/contracts/membership.ts";
import { readHistory } from "./application/read-history.ts";
import { postgresHistoryReader } from "./infrastructure/postgres-history-reader.ts";
import { postgresHistoryWriter } from "./infrastructure/postgres-history-writer.ts";

export const historyWriterOn = (tx: PostgresTransaction) =>
  postgresHistoryWriter(tx, { newId: randomUUID });

export const historyModule = ({
  db,
  memberships,
  projects,
}: {
  readonly db: PostgresDatabase;
  readonly memberships: MembershipReader;
  readonly projects: ProjectFinder;
}) => ({
  readHistory: readHistory({ projects, memberships, history: postgresHistoryReader(db) }),
});
