import type { CheckTokens, TokenCheck } from "../domain/token-check.ts";
import { checkedValues, type ModeReader, type ProjectTokenReader } from "./add-token.ts";

export const checkTokens =
  ({
    modes,
    projectTokens,
  }: {
    readonly modes: ModeReader;
    readonly projectTokens: ProjectTokenReader;
  }): CheckTokens =>
  async ({ projectId, tokens }) => {
    const [projectModes, existing] = await Promise.all([
      modes.modesOf(projectId),
      projectTokens.tokensOf(projectId),
    ]);
    return tokens.flatMap((token, index): readonly TokenCheck[] => {
      const checked = checkedValues(token, { projectModes, tokens: existing, written: tokens });
      return checked.ok ? [] : [{ index, failure: checked.error }];
    });
  };
