import { randomUUID } from "node:crypto";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { MembershipReader } from "#modules/space/contracts/membership.ts";

import { createProject } from "./application/create-project.ts";
import {
  postgresProjectFinder,
  postgresProjectUnitOfWork,
} from "./infrastructure/postgres-projects.ts";

const now = () => new Date();

export const projectModule = ({
  db,
  memberships,
  historyWriterOn,
}: {
  readonly db: PostgresDatabase;
  readonly memberships: MembershipReader;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
}) => ({
  createProject: createProject({
    memberships,
    unitOfWork: postgresProjectUnitOfWork({ db, historyWriterOn }),
    newId: randomUUID,
    now,
  }),
  finder: postgresProjectFinder(db),
});
