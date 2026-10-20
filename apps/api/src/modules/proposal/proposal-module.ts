import { randomUUID } from "node:crypto";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { ProjectAccess } from "#modules/space/contracts/membership.ts";
import type { CheckTokens, ValidatedTokenWriter } from "#modules/token/contracts/token-issues.ts";
import type { Clock } from "#platform/clock.ts";

import { closeBatch, openBatch } from "./application/proposal-batches.ts";
import {
  batchOf,
  type FigmaStateSynchronizer,
  listBatches,
  pendingProposalsOf,
  reviewProposal,
  validateBatch,
} from "./application/review-proposals.ts";
import {
  type ProposedTokens,
  proposeTokens,
  type ValidatedTokensOf,
  writeTokens,
} from "./application/write-tokens.ts";
import {
  postgresProposalReader,
  postgresProposalReplacer,
  postgresProposalStore,
  postgresProposalUnitOfWork,
  postgresReviewUnitOfWork,
} from "./infrastructure/postgres-proposals.ts";

export const proposalReplacerOn = postgresProposalReplacer;

export const proposalWriterOn = (tx: PostgresTransaction) => ({
  propose: (proposed: ProposedTokens) =>
    proposeTokens(postgresProposalStore(tx), { ...proposed, newId: randomUUID }),
});

export const proposalModule = ({
  db,
  access,
  checkTokens,
  validatedTokensOf,
  historyWriterOn,
  validatedTokenWriterOn,
  figmaStateOn,
  clock: now,
}: {
  readonly db: PostgresDatabase;
  readonly access: ProjectAccess;
  readonly checkTokens: CheckTokens;
  readonly validatedTokensOf: ValidatedTokensOf;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
  readonly validatedTokenWriterOn: (tx: PostgresTransaction) => ValidatedTokenWriter;
  readonly figmaStateOn: (tx: PostgresTransaction) => FigmaStateSynchronizer;
  readonly clock: Clock;
}) => {
  const reading = {
    access,
    validatedTokensOf,
    proposals: postgresProposalReader(db),
    now,
  };
  const unitOfWork = postgresProposalUnitOfWork(db);
  const reviewUnitOfWork = postgresReviewUnitOfWork({
    db,
    historyWriterOn,
    validatedTokenWriterOn,
    figmaStateOn,
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
    listBatches: listBatches(reading),
    batchOf: batchOf(reading),
    reviewProposal: reviewProposal({ ...reading, unitOfWork: reviewUnitOfWork }),
    validateBatch: validateBatch({ ...reading, unitOfWork: reviewUnitOfWork }),
    pendingProposalsOf: pendingProposalsOf(reading),
  };
};
