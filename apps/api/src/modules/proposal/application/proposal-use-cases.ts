import type { writeTokens } from "./write-tokens.ts";

export type ProposalUseCases = {
  readonly writeTokens: ReturnType<typeof writeTokens>;
};
