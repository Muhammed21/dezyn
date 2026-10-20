import type { CheckTokens, TokenCheck } from "../domain/token-check.ts";
import { checkedValues, type ModeReader, type ProjectTokenReader } from "./token-values.ts";

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
      if (tokens.findIndex(({ name }) => name === token.name) < index) {
        return [{ index, failure: { code: "duplicate_name" } }];
      }
      const validated = existing.find(({ name }) => name === token.name);
      if (validated !== undefined && validated.$type !== token.$type) {
        return [{ index, failure: { code: "type_changed" } }];
      }
      const checked = checkedValues(token, { projectModes, tokens: existing, written: tokens });
      return checked.ok ? [] : [{ index, failure: checked.error }];
    });
  };
