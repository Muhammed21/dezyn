import type { ModeRefusal } from "./mode-completeness.ts";
import type { ReferenceRefusal, WrittenToken } from "./reference.ts";
import type { TokenDefinition } from "./token.ts";

export type TokenCheckFailure =
  | { readonly code: "invalid_modes"; readonly refusals: readonly ModeRefusal[] }
  | {
      readonly code: "invalid_references";
      readonly refusals: readonly { readonly mode?: string; readonly refusal: ReferenceRefusal }[];
    }
  | { readonly code: "type_changed" }
  | { readonly code: "duplicate_name" };

export type TokenCheck = { readonly index: number; readonly failure: TokenCheckFailure };

export type CheckTokens = (written: {
  readonly projectId: string;
  readonly tokens: readonly TokenDefinition[];
}) => Promise<readonly TokenCheck[]>;

export type ValidatedTokenFailure = TokenCheckFailure | { readonly code: "name_taken" };

export type ValidatedToken = {
  readonly projectId: string;
  readonly token: TokenDefinition;
  readonly pending: readonly WrittenToken[];
  readonly createdAt: Date;
};

export interface ValidatedTokenWriter {
  create(validated: ValidatedToken): Promise<ValidatedTokenFailure | undefined>;
  replace(validated: ValidatedToken): Promise<ValidatedTokenFailure | undefined>;
}
