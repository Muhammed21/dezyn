import { randomUUID } from "node:crypto";

import type { PostgresDatabase, PostgresTransaction } from "../../platform/postgres-database.ts";
import type { HistoryWriter } from "../history/contracts/history-writer.ts";
import type { ProjectFinder } from "../project/contracts/project.ts";
import type { MembershipReader } from "../space/contracts/membership.ts";
import { addToken } from "./application/add-token.ts";
import { checkTokens } from "./application/check-tokens.ts";
import { readTokens } from "./application/read-tokens.ts";
import {
  postgresModeReader,
  postgresProjectTokenReader,
  postgresTokenUnitOfWork,
  postgresValidatedTokenReader,
} from "./infrastructure/postgres-tokens.ts";

const now = () => new Date();

export const tokenModule = ({
  db,
  memberships,
  projects,
  historyWriterOn,
}: {
  readonly db: PostgresDatabase;
  readonly memberships: MembershipReader;
  readonly projects: ProjectFinder;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
}) => ({
  addToken: addToken({
    projects,
    memberships,
    modes: postgresModeReader(db),
    projectTokens: postgresProjectTokenReader(db),
    unitOfWork: postgresTokenUnitOfWork({ db, historyWriterOn, newId: randomUUID }),
    newId: randomUUID,
    now,
  }),
  checkTokens: checkTokens({
    modes: postgresModeReader(db),
    projectTokens: postgresProjectTokenReader(db),
  }),
  readTokens: readTokens({
    modes: postgresModeReader(db),
    tokens: postgresValidatedTokenReader(db),
  }),
});
