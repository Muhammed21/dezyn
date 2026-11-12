import { Uuid } from "@repo/contracts";
import { err, type Result } from "@repo/result";

import type { Batch, BatchSummary, ProposalFailure } from "../domain/proposal.ts";
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
});
