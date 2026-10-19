export type FigmaState = "synced" | "missing_in_figma";

const FIGMA_STATES: readonly FigmaState[] = ["synced", "missing_in_figma"];

export type FigmaEntry = { readonly name: string; readonly state: string };

export type DeclaredState = {
  readonly tokenId: string;
  readonly name: string;
  readonly state: FigmaState;
};

export type FigmaRefusal = "unknown_token" | "unknown_state" | "duplicate_name";

export type FigmaDeclarationCheck =
  | { readonly states: readonly DeclaredState[] }
  | { readonly refusals: readonly { readonly index: number; readonly refusal: FigmaRefusal }[] };

const refusedWhen = (refused: boolean, refusal: FigmaRefusal): readonly FigmaRefusal[] =>
  refused ? [refusal] : [];

const figmaStateOf = (state: string): FigmaState | undefined =>
  FIGMA_STATES.find((known) => known === state);

export const checkFigmaDeclaration = ({
  entries,
  tokens,
}: {
  readonly entries: readonly FigmaEntry[];
  readonly tokens: readonly { readonly id: string; readonly name: string }[];
}): FigmaDeclarationCheck => {
  const checked = entries.map(({ name, state }, index) => {
    const token = tokens.find((candidate) => candidate.name === name);
    const known = figmaStateOf(state);
    const refusals = [
      ...refusedWhen(entries.findIndex((entry) => entry.name === name) < index, "duplicate_name"),
      ...refusedWhen(token === undefined, "unknown_token"),
      ...refusedWhen(known === undefined, "unknown_state"),
    ];
    return { index, token, state: known, refusals };
  });
  const refusals = checked.flatMap(({ index, refusals: found }) =>
    found.map((refusal) => ({ index, refusal })),
  );
  if (refusals.length > 0) {
    return { refusals };
  }
  return {
    states: checked.flatMap(({ token, state }) =>
      token === undefined || state === undefined
        ? []
        : [{ tokenId: token.id, name: token.name, state }],
    ),
  };
};
