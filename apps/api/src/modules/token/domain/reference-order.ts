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

export const inCycle = <T>(
  items: readonly T[],
  definitionOf: (item: T) => TokenDefinition,
): readonly T[] => {
  const names = new Set(items.map((item) => definitionOf(item).name));
  const referencesOf = new Map(
    items.map((item) => {
      const { name } = definitionOf(item);
      return [
        name,
        referencedNames(definitionOf(item)).filter(
          (referenced) => referenced !== name && names.has(referenced),
        ),
      ];
    }),
  );
  const reachable = (
    frontier: readonly string[],
    visited: ReadonlySet<string>,
  ): ReadonlySet<string> => {
    const next = [...new Set(frontier.flatMap((name) => referencesOf.get(name) ?? []))].filter(
      (name) => !visited.has(name),
    );
    return next.length === 0 ? visited : reachable(next, new Set([...visited, ...next]));
  };
  return items.filter((item) => {
    const { name } = definitionOf(item);
    return reachable([name], new Set()).has(name);
  });
};
