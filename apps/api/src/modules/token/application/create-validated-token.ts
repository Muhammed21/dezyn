import type { ValidatedToken, ValidatedTokenWriter } from "../domain/token-check.ts";
import { groupConflict } from "../domain/token-name.ts";
import {
  checkedValues,
  type ModeReader,
  modeValueOf,
  type ProjectTokenReader,
  type TokenWriter,
} from "./token-values.ts";

const checkedFor = async (
  {
    modes,
    projectTokens,
  }: { readonly modes: ModeReader; readonly projectTokens: ProjectTokenReader },
  { projectId, token, pending }: ValidatedToken,
) =>
  checkedValues(token, {
    projectModes: await modes.modesOf(projectId),
    tokens: await projectTokens.tokensOf(projectId),
    pending,
  });

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
  create: async (validated) => {
    const { projectId, token, createdAt } = validated;
    const other = groupConflict(
      token.name,
      (await projectTokens.tokensOf(projectId)).map(({ name }) => name),
    );
    if (other !== undefined) {
      return { code: "name_conflict", other };
    }
    const checked = await checkedFor({ modes, projectTokens }, validated);
    if (!checked.ok) {
      return checked.error;
    }
    const outcome = await tokens.create(
      { ...token, id: newId(), projectId, status: "validated", createdAt },
      checked.value.map(modeValueOf),
    );
    return outcome === "name_taken" ? { code: "name_taken" } : undefined;
  },
  replace: async (validated) => {
    const checked = await checkedFor({ modes, projectTokens }, validated);
    if (!checked.ok) {
      return checked.error;
    }
    await tokens.replace(
      { ...validated.token, projectId: validated.projectId },
      checked.value.map(modeValueOf),
    );
    return undefined;
  },
});
