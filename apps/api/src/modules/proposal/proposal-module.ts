import { randomUUID } from "node:crypto";

import type { PostgresDatabase, PostgresTransaction } from "../../platform/postgres-database.ts";
import type { HistoryWriter } from "../history/contracts/history-writer.ts";
import type { ProjectFinder } from "../project/contracts/project.ts";
import type { MembershipReader } from "../space/contracts/membership.ts";
import type { CheckTokens, ValidatedTokenWriter } from "../token/contracts/token-issues.ts";
import { batchOf, listBatches, reviewProposition } from "./application/review-propositions.ts";
import { writeTokens } from "./application/write-tokens.ts";
import {
  postgresPropositionReader,
  postgresPropositionUnitOfWork,
  postgresReviewUnitOfWork,
} from "./infrastructure/postgres-propositions.ts";

const now = () => new Date();

export const proposalModule = ({
  db,
  memberships,
  projects,
  checkTokens,
  historyWriterOn,
  validatedTokenWriterOn,
}: {
  readonly db: PostgresDatabase;
  readonly memberships: MembershipReader;
  readonly projects: ProjectFinder;
  readonly checkTokens: CheckTokens;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
  readonly validatedTokenWriterOn: (tx: PostgresTransaction) => ValidatedTokenWriter;
}) => {
  const access = { projects, memberships, propositions: postgresPropositionReader(db) };
  return {
    writeTokens: writeTokens({
      checkTokens,
      unitOfWork: postgresPropositionUnitOfWork(db),
      newId: randomUUID,
      now,
    }),
    listBatches: listBatches(access),
    batchOf: batchOf(access),
    reviewProposition: reviewProposition({
      ...access,
      unitOfWork: postgresReviewUnitOfWork({ db, historyWriterOn, validatedTokenWriterOn }),
      now,
    }),
  };
};
