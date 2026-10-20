import { tokenNameRefusal } from "./token-name.ts";

export type ProjectToken = {
  readonly id: string;
  readonly name: string;
  readonly $type: string;
  readonly status: string;
};

export type ReferenceRefusal = "unknown_reference" | "unvalidated_reference" | "type_mismatch";

const ALIAS = /^\{(.*)\}$/;

export const aliasName = (value: unknown): string | undefined => {
  const name = typeof value === "string" ? ALIAS.exec(value)?.[1] : undefined;
  return name === undefined || tokenNameRefusal(name) !== undefined ? undefined : name;
};

export type Alias = `{${string}}`;

export const isReference = (value: unknown): value is Alias => aliasName(value) !== undefined;

export type WrittenToken = { readonly name: string; readonly $type: string };

export type Resolution =
  | { readonly tokenId: string }
  | { readonly written: string }
  | { readonly refusal: ReferenceRefusal };

export const resolveReference = ({
  name,
  $type,
  tokens,
  written = [],
  pending = [],
}: {
  readonly name: string;
  readonly $type: string;
  readonly tokens: readonly ProjectToken[];
  readonly written?: readonly WrittenToken[];
  readonly pending?: readonly WrittenToken[];
}): Resolution => {
  const sibling = written.find((token) => token.name === name);
  if (sibling !== undefined) {
    return sibling.$type === $type ? { written: name } : { refusal: "type_mismatch" };
  }
  const target = tokens.find((token) => token.name === name);
  if (target === undefined) {
    return pending.some((token) => token.name === name)
      ? { refusal: "unvalidated_reference" }
      : { refusal: "unknown_reference" };
  }
  if (target.status !== "validated") {
    return { refusal: "unvalidated_reference" };
  }
  return target.$type === $type ? { tokenId: target.id } : { refusal: "type_mismatch" };
};

export const referencedNames = ({
  $value,
  modes = {},
}: {
  readonly $value?: unknown;
  readonly modes?: Readonly<Record<string, unknown>>;
}): readonly string[] =>
  [$value, ...Object.values(modes)].flatMap((value) => {
    const name = aliasName(value);
    return name === undefined ? [] : [name];
  });
