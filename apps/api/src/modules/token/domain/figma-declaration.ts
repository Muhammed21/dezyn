export type FigmaState = "synced" | "missing_in_figma" | "duplicate_in_figma" | "diverged";

const FIGMA_STATES: readonly FigmaState[] = [
  "synced",
  "missing_in_figma",
  "duplicate_in_figma",
  "diverged",
];

const MINIMUM_FIGMA_VARIABLES = 2;

export type FigmaEntry = {
  readonly name: string;
  readonly state: string;
  readonly figmaVariables?: readonly string[];
  readonly figmaValue?: unknown;
};

export type DeclaredState = {
  readonly tokenId: string;
  readonly name: string;
} & (
  | { readonly state: "synced" | "missing_in_figma" }
  | { readonly state: "duplicate_in_figma"; readonly figmaVariables: readonly string[] }
  | { readonly state: "diverged"; readonly figmaValue: unknown }
);

export type FigmaRefusal =
  | "unknown_token"
  | "unknown_state"
  | "duplicate_name"
  | "too_few_figma_variables"
  | "figma_variables_without_duplicate"
  | "missing_figma_value"
  | "figma_value_without_divergence";

export type FigmaDeclarationCheck =
  | { readonly states: readonly DeclaredState[] }
  | { readonly refusals: readonly { readonly index: number; readonly refusal: FigmaRefusal }[] };

const refusedWhen = (refused: boolean, refusal: FigmaRefusal): readonly FigmaRefusal[] =>
  refused ? [refusal] : [];

const figmaStateOf = (state: string): FigmaState | undefined =>
  FIGMA_STATES.find((known) => known === state);

const variableRefusals = (
  state: FigmaState,
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

const valueRefusals = (state: FigmaState, figmaValue: unknown): readonly FigmaRefusal[] =>
  state === "diverged"
    ? refusedWhen(figmaValue === undefined, "missing_figma_value")
    : refusedWhen(figmaValue !== undefined, "figma_value_without_divergence");

const declaredOf = (
  token: { readonly id: string; readonly name: string },
  state: FigmaState,
  { figmaVariables, figmaValue }: Pick<FigmaEntry, "figmaVariables" | "figmaValue">,
): DeclaredState => {
  const declared = { tokenId: token.id, name: token.name };
  if (state === "duplicate_in_figma") {
    return { ...declared, state, figmaVariables: figmaVariables ?? [] };
  }
  if (state === "diverged") {
    return { ...declared, state, figmaValue };
  }
  return { ...declared, state };
};

export const checkFigmaDeclaration = ({
  entries,
  tokens,
}: {
  readonly entries: readonly FigmaEntry[];
  readonly tokens: readonly { readonly id: string; readonly name: string }[];
}): FigmaDeclarationCheck => {
  const checked = entries.map((entry, index) => {
    const token = tokens.find((candidate) => candidate.name === entry.name);
    const known = figmaStateOf(entry.state);
    const refusals = [
      ...refusedWhen(
        entries.findIndex(({ name }) => name === entry.name) < index,
        "duplicate_name",
      ),
      ...refusedWhen(token === undefined, "unknown_token"),
      ...refusedWhen(known === undefined, "unknown_state"),
      ...(known === undefined
        ? []
        : [
            ...variableRefusals(known, entry.figmaVariables),
            ...valueRefusals(known, entry.figmaValue),
          ]),
    ];
    return { index, token, state: known, entry, refusals };
  });
  const refusals = checked.flatMap(({ index, refusals: found }) =>
    found.map((refusal) => ({ index, refusal })),
  );
  if (refusals.length > 0) {
    return { refusals };
  }
  return {
    states: checked.flatMap(({ token, state, entry }) =>
      token === undefined || state === undefined ? [] : [declaredOf(token, state, entry)],
    ),
  };
};
