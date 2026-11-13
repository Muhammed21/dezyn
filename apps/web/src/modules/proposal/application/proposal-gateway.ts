import type { Result } from "@repo/result";

import type {
  Batch,
  BatchSummary,
  BatchValidationFailure,
  Decision,
  ProposalFailure,
  ReviewedProposal,
  ReviewFailure,
  ValidatedBatch,
} from "../domain/proposal.ts";

export type ProposalGateway = {
  readonly listBatches: (project: {
    readonly projectId: string;
  }) => Promise<Result<readonly BatchSummary[], ProposalFailure>>;
  readonly readBatch: (batch: {
    readonly batchId: string;
  }) => Promise<Result<Batch, ProposalFailure>>;
  readonly reviewProposal: (review: {
    readonly proposalId: string;
    readonly decision: Decision;
  }) => Promise<Result<ReviewedProposal, ReviewFailure>>;
  readonly validateBatch: (validation: {
    readonly batchId: string;
    readonly rejected: readonly string[];
  }) => Promise<Result<ValidatedBatch, BatchValidationFailure>>;
};
