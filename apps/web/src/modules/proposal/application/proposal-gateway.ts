import type { Result } from "@repo/result";

import type { BatchSummary, ProposalFailure } from "../domain/proposal.ts";

export type ProposalGateway = {
  readonly listBatches: (project: {
    readonly projectId: string;
  }) => Promise<Result<readonly BatchSummary[], ProposalFailure>>;
};
