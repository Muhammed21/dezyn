import { Uuid } from "@repo/contracts";
import { err, type Result } from "@repo/result";

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
import type { ProposalGateway } from "./proposal-gateway.ts";

export const proposalUseCases = ({ gateway }: { readonly gateway: ProposalGateway }) => ({
  listBatches: async ({
    projectId,
  }: {
    readonly projectId: string;
  }): Promise<Result<readonly BatchSummary[], ProposalFailure>> =>
    Uuid.safeParse(projectId).success ? gateway.listBatches({ projectId }) : err("not_found"),
  readBatch: async ({
    batchId,
  }: {
    readonly batchId: string;
  }): Promise<Result<Batch, ProposalFailure>> =>
    Uuid.safeParse(batchId).success ? gateway.readBatch({ batchId }) : err("not_found"),
  reviewProposal: async ({
    proposalId,
    decision,
  }: {
    readonly proposalId: string;
    readonly decision: Decision;
  }): Promise<Result<ReviewedProposal, ReviewFailure>> =>
    Uuid.safeParse(proposalId).success
      ? gateway.reviewProposal({ proposalId, decision })
      : err("not_found"),
  validateBatch: async ({
    batchId,
    rejected,
  }: {
    readonly batchId: string;
    readonly rejected: readonly string[];
  }): Promise<Result<ValidatedBatch, BatchValidationFailure>> =>
    Uuid.safeParse(batchId).success
      ? gateway.validateBatch({ batchId, rejected })
      : err("not_found"),
});
