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

export const resolveReference = ({
  name,
  $type,
  tokens,
}: {
  readonly name: string;
  readonly $type: string;
  readonly tokens: readonly ProjectToken[];
}): { readonly tokenId: string } | { readonly refusal: ReferenceRefusal } => {
  const target = tokens.find((token) => token.name === name);
  if (target === undefined) {
    return { refusal: "unknown_reference" };
  }
  if (target.status !== "validated") {
    return { refusal: "unvalidated_reference" };
  }
  return target.$type === $type ? { tokenId: target.id } : { refusal: "type_mismatch" };
};
