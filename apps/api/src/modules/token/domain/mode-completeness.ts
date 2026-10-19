export type ModeRefusal =
  | { readonly mode: string; readonly refusal: "missing_mode" | "unknown_mode" }
  | { readonly refusal: "value_without_mode" | "modes_without_modifier" | "missing_value" };

export type SentValues = {
  readonly value: boolean;
  readonly modes: readonly string[] | undefined;
};

const singleValueRefusals = ({ value, modes }: SentValues): readonly ModeRefusal[] => {
  if (modes !== undefined) {
    return [{ refusal: "modes_without_modifier" }];
  }
  return value ? [] : [{ refusal: "missing_value" }];
};

export const modeRefusals = ({
  projectModes,
  sent,
}: {
  readonly projectModes: readonly string[];
  readonly sent: SentValues;
}): readonly ModeRefusal[] => {
  if (projectModes.length === 0) {
    return singleValueRefusals(sent);
  }
  if (sent.value) {
    return [{ refusal: "value_without_mode" }];
  }
  const sentModes = sent.modes ?? [];
  return [
    ...projectModes
      .filter((mode) => !sentModes.includes(mode))
      .map((mode): ModeRefusal => ({ mode, refusal: "missing_mode" })),
    ...sentModes
      .filter((mode) => !projectModes.includes(mode))
      .map((mode): ModeRefusal => ({ mode, refusal: "unknown_mode" })),
  ];
};
