import type { ModeRefusal } from "./mode-completeness.ts";
import type { ReferenceRefusal } from "./reference.ts";
import type { TokenDefinition } from "./token.ts";

export type TokenCheckFailure =
  | { readonly code: "invalid_modes"; readonly refusals: readonly ModeRefusal[] }
  | {
      readonly code: "invalid_references";
      readonly refusals: readonly { readonly mode?: string; readonly refusal: ReferenceRefusal }[];
    };

export type TokenCheck = { readonly index: number; readonly failure: TokenCheckFailure };

export type CheckTokens = (written: {
  readonly projectId: string;
  readonly tokens: readonly TokenDefinition[];
}) => Promise<readonly TokenCheck[]>;
