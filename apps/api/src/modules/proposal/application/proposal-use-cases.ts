import type { closeBatch, openBatch } from "./proposition-lots.ts";
import type {
  batchOf,
  listBatches,
  reviewProposition,
  validateBatch,
} from "./review-propositions.ts";
import type { writeTokens } from "./write-tokens.ts";

export type ProposalUseCases = {
  readonly writeTokens: ReturnType<typeof writeTokens>;
  readonly openBatch: ReturnType<typeof openBatch>;
  readonly closeBatch: ReturnType<typeof closeBatch>;
  readonly listBatches: ReturnType<typeof listBatches>;
  readonly batchOf: ReturnType<typeof batchOf>;
  readonly reviewProposition: ReturnType<typeof reviewProposition>;
  readonly validateBatch: ReturnType<typeof validateBatch>;
};
