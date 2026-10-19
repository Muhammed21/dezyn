import type { ValidatedTokenWriter } from "../domain/token-check.ts";
import {
  checkedValues,
  type ModeReader,
  modeValueOf,
  type ProjectTokenReader,
  type TokenWriter,
} from "./add-token.ts";

export const validatedTokenWriter = ({
  modes,
  projectTokens,
  tokens,
  newId,
}: {
  readonly modes: ModeReader;
  readonly projectTokens: ProjectTokenReader;
  readonly tokens: TokenWriter;
  readonly newId: () => string;
}): ValidatedTokenWriter => ({
  create: async ({ projectId, token, pending, createdAt }) => {
    const checked = checkedValues(token, {
      projectModes: await modes.modesOf(projectId),
      tokens: await projectTokens.tokensOf(projectId),
      pending,
    });
    if (!checked.ok) {
      return checked.error;
    }
    const outcome = await tokens.create(
      { ...token, id: newId(), projectId, status: "validated", createdAt },
      checked.value.map(modeValueOf),
    );
    return outcome === "name_taken" ? { code: "name_taken" } : undefined;
  },
});
