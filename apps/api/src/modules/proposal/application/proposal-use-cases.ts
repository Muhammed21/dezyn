import type { batchOf, listBatches, reviewProposition } from "./review-propositions.ts";
import type { writeTokens } from "./write-tokens.ts";

export type ProposalUseCases = {
  readonly writeTokens: ReturnType<typeof writeTokens>;
  readonly listBatches: ReturnType<typeof listBatches>;
  readonly batchOf: ReturnType<typeof batchOf>;
  readonly reviewProposition: ReturnType<typeof reviewProposition>;
};
