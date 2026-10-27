export type TokenNameRefusal = "empty_segment" | "dollar_prefix" | "brace";

const segmentRefusal = (segment: string): TokenNameRefusal | undefined => {
  if (segment === "") {
    return "empty_segment";
  }
  if (segment.startsWith("$")) {
    return "dollar_prefix";
  }
  return segment.includes("{") || segment.includes("}") ? "brace" : undefined;
};

export const tokenNameRefusal = (name: string): TokenNameRefusal | undefined =>
  name
    .split(".")
    .map(segmentRefusal)
    .find((refusal) => refusal !== undefined);

const isGroupOf = (group: string, name: string) => name.startsWith(`${group}.`);

export const groupConflict = (name: string, others: readonly string[]): string | undefined =>
  others.find((other) => isGroupOf(name, other) || isGroupOf(other, name));

export type GroupConflict = { readonly name: string; readonly other: string };

export const groupConflicts = (names: readonly string[]): readonly GroupConflict[] =>
  names.flatMap((name) =>
    names.filter((other) => isGroupOf(name, other)).map((other) => ({ name, other })),
  );
