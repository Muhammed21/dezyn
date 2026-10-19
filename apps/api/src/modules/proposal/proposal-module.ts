import { randomUUID } from "node:crypto";

import type { Clock } from "../../platform/clock.ts";
import type { PostgresDatabase, PostgresTransaction } from "../../platform/postgres-database.ts";
import type { HistoryWriter } from "../history/contracts/history-writer.ts";
import type { ProjectFinder } from "../project/contracts/project.ts";
import type { MembershipReader } from "../space/contracts/membership.ts";
import type { CheckTokens, ValidatedTokenWriter } from "../token/contracts/token-issues.ts";
import { closeBatch, openBatch } from "./application/proposition-lots.ts";
import {
  batchOf,
  listBatches,
  reviewProposition,
  validateBatch,
} from "./application/review-propositions.ts";
import { type ValidatedTokensOf, writeTokens } from "./application/write-tokens.ts";
import {
  postgresPropositionReader,
  postgresPropositionReplacer,
  postgresPropositionUnitOfWork,
  postgresReviewUnitOfWork,
} from "./infrastructure/postgres-propositions.ts";

export const propositionReplacerOn = postgresPropositionReplacer;

export const proposalModule = ({
  db,
  memberships,
  projects,
  checkTokens,
  validatedTokensOf,
  historyWriterOn,
  validatedTokenWriterOn,
  clock: now,
}: {
  readonly db: PostgresDatabase;
  readonly memberships: MembershipReader;
  readonly projects: ProjectFinder;
  readonly checkTokens: CheckTokens;
  readonly validatedTokensOf: ValidatedTokensOf;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
  readonly validatedTokenWriterOn: (tx: PostgresTransaction) => ValidatedTokenWriter;
  readonly clock: Clock;
}) => {
  const access = {
    projects,
    memberships,
    validatedTokensOf,
    propositions: postgresPropositionReader(db),
    now,
  };
  const unitOfWork = postgresPropositionUnitOfWork(db);
  const reviewUnitOfWork = postgresReviewUnitOfWork({
    db,
    historyWriterOn,
    validatedTokenWriterOn,
  });
  return {
    writeTokens: writeTokens({
      checkTokens,
      validatedTokensOf,
      unitOfWork,
      newId: randomUUID,
      now,
    }),
    openBatch: openBatch({ unitOfWork, newId: randomUUID, now }),
    closeBatch: closeBatch({ unitOfWork, now }),
    listBatches: listBatches(access),
    batchOf: batchOf(access),
    reviewProposition: reviewProposition({ ...access, unitOfWork: reviewUnitOfWork }),
    validateBatch: validateBatch({ ...access, unitOfWork: reviewUnitOfWork }),
  };
};
