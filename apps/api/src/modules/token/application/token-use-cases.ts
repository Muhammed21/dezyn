import type { addToken } from "./add-token.ts";
import type { checkTokens } from "./check-tokens.ts";
import type { declareFigmaStates } from "./declare-figma-states.ts";
import type { exportTokens } from "./export-tokens.ts";
import type { importTokens } from "./import-tokens.ts";
import type { readProjectTokens, readTokens } from "./read-tokens.ts";

export type TokenUseCases = {
  readonly addToken: ReturnType<typeof addToken>;
  readonly readTokens: ReturnType<typeof readTokens>;
  readonly checkTokens: ReturnType<typeof checkTokens>;
  readonly readProjectTokens: ReturnType<typeof readProjectTokens>;
  readonly declareFigmaStates: ReturnType<typeof declareFigmaStates>;
  readonly exportTokens: ReturnType<typeof exportTokens>;
  readonly importTokens: ReturnType<typeof importTokens>;
};
