import { referencedNames } from "./field-references.ts";
import type { TokenDefinition } from "./token.ts";

export const referencesFirst = <T>(
  remaining: readonly T[],
  definitionOf: (item: T) => TokenDefinition,
  placed: readonly T[] = [],
): readonly T[] => {
  const waiting = new Set(remaining.map((item) => definitionOf(item).name));
  const ready = remaining.find((item) =>
    referencedNames(definitionOf(item)).every((name) => !waiting.has(name)),
  );
  if (ready === undefined) {
    return [...placed, ...remaining];
  }
  return referencesFirst(
    remaining.filter((item) => item !== ready),
    definitionOf,
    [...placed, ready],
  );
};
