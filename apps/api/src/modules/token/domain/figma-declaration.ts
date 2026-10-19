export type FigmaState = "synced" | "missing_in_figma" | "duplicate_in_figma";

const FIGMA_STATES: readonly FigmaState[] = ["synced", "missing_in_figma", "duplicate_in_figma"];

const MINIMUM_FIGMA_VARIABLES = 2;

export type FigmaEntry = {
  readonly name: string;
  readonly state: string;
  readonly figmaVariables?: readonly string[];
};

export type DeclaredState = {
  readonly tokenId: string;
  readonly name: string;
} & (
  | { readonly state: "synced" | "missing_in_figma" }
  | { readonly state: "duplicate_in_figma"; readonly figmaVariables: readonly string[] }
);

export type FigmaRefusal =
  | "unknown_token"
  | "unknown_state"
  | "duplicate_name"
  | "too_few_figma_variables"
  | "figma_variables_without_duplicate";

export type FigmaDeclarationCheck =
  | { readonly states: readonly DeclaredState[] }
  | { readonly refusals: readonly { readonly index: number; readonly refusal: FigmaRefusal }[] };

const refusedWhen = (refused: boolean, refusal: FigmaRefusal): readonly FigmaRefusal[] =>
  refused ? [refusal] : [];

const figmaStateOf = (state: string): FigmaState | undefined =>
  FIGMA_STATES.find((known) => known === state);

const variableRefusals = (
  state: FigmaState | undefined,
  figmaVariables: readonly string[] | undefined,
): readonly FigmaRefusal[] => {
  if (state === "duplicate_in_figma") {
    const named = figmaVariables ?? [];
    return refusedWhen(
      new Set(named).size < MINIMUM_FIGMA_VARIABLES || named.includes(""),
      "too_few_figma_variables",
    );
  }
  return refusedWhen(figmaVariables !== undefined, "figma_variables_without_duplicate");
};

const declaredOf = (
  token: { readonly id: string; readonly name: string },
  state: FigmaState,
  figmaVariables: readonly string[],
): DeclaredState =>
  state === "duplicate_in_figma"
    ? { tokenId: token.id, name: token.name, state, figmaVariables }
    : { tokenId: token.id, name: token.name, state };

export const checkFigmaDeclaration = ({
  entries,
  tokens,
}: {
  readonly entries: readonly FigmaEntry[];
  readonly tokens: readonly { readonly id: string; readonly name: string }[];
}): FigmaDeclarationCheck => {
  const checked = entries.map(({ name, state, figmaVariables }, index) => {
    const token = tokens.find((candidate) => candidate.name === name);
    const known = figmaStateOf(state);
    const refusals = [
      ...refusedWhen(entries.findIndex((entry) => entry.name === name) < index, "duplicate_name"),
      ...refusedWhen(token === undefined, "unknown_token"),
      ...refusedWhen(known === undefined, "unknown_state"),
      ...(known === undefined ? [] : variableRefusals(known, figmaVariables)),
    ];
    return { index, token, state: known, figmaVariables: figmaVariables ?? [], refusals };
  });
  const refusals = checked.flatMap(({ index, refusals: found }) =>
    found.map((refusal) => ({ index, refusal })),
  );
  if (refusals.length > 0) {
    return { refusals };
  }
  return {
    states: checked.flatMap(({ token, state, figmaVariables }) =>
      token === undefined || state === undefined ? [] : [declaredOf(token, state, figmaVariables)],
    ),
  };
};
