import type { addToken } from "./add-token.ts";
import type { checkTokens } from "./check-tokens.ts";
import type { readTokens } from "./read-tokens.ts";

export type TokenUseCases = {
  readonly addToken: ReturnType<typeof addToken>;
  readonly readTokens: ReturnType<typeof readTokens>;
  readonly checkTokens: ReturnType<typeof checkTokens>;
};
