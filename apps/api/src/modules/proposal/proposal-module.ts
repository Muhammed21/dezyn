import { randomUUID } from "node:crypto";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { ProjectFinder } from "#modules/project/contracts/project.ts";
import type { MembershipReader } from "#modules/space/contracts/membership.ts";
import type { CheckTokens, ValidatedTokenWriter } from "#modules/token/contracts/token-issues.ts";
import type { Clock } from "#platform/clock.ts";

import { closeBatch, openBatch } from "./application/proposal-batches.ts";
import {
  batchOf,
  listBatches,
  pendingProposalsOf,
  reviewProposal,
  validateBatch,
} from "./application/review-proposals.ts";
import { type ValidatedTokensOf, writeTokens } from "./application/write-tokens.ts";
import {
  postgresProposalReader,
  postgresProposalReplacer,
  postgresProposalUnitOfWork,
  postgresReviewUnitOfWork,
} from "./infrastructure/postgres-proposals.ts";

export const proposalReplacerOn = postgresProposalReplacer;

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
    proposals: postgresProposalReader(db),
    now,
  };
  const unitOfWork = postgresProposalUnitOfWork(db);
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
    reviewProposal: reviewProposal({ ...access, unitOfWork: reviewUnitOfWork }),
    validateBatch: validateBatch({ ...access, unitOfWork: reviewUnitOfWork }),
    pendingProposalsOf: pendingProposalsOf(access),
  };
};
