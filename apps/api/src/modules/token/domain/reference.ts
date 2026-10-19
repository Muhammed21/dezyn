import { tokenNameRefusal } from "./token-name.ts";

export type ProjectToken = {
  readonly id: string;
  readonly name: string;
  readonly $type: string;
  readonly status: string;
};

export type ReferenceRefusal = "unknown_reference" | "unvalidated_reference" | "type_mismatch";

const ALIAS = /^\{(.*)\}$/;

export const aliasName = (value: string): string | undefined => {
  const name = ALIAS.exec(value)?.[1];
  return name === undefined || tokenNameRefusal(name) !== undefined ? undefined : name;
};

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
