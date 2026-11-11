const TOKEN_TYPES = [
  "color",
  "dimension",
  "typography",
  "shadow",
  "gradient",
  "fontFamily",
  "fontWeight",
  "number",
] as const;

export type TokenType = (typeof TOKEN_TYPES)[number] | "unknown";

export type TokenValue =
  | { readonly kind: "single"; readonly value: unknown }
  | { readonly kind: "by_mode"; readonly values: Readonly<Record<string, unknown>> };

export type Token = {
  readonly id: string;
  readonly name: string;
  readonly type: TokenType;
  readonly value: TokenValue;
  readonly description: string | undefined;
};

export type ProjectTokens = {
  readonly modes: readonly string[];
  readonly tokens: readonly Token[];
};

export type TokensFailure = "unauthenticated" | "not_found" | "unavailable" | "invalid_response";

export const tokenTypeOf = (value: string): TokenType =>
  TOKEN_TYPES.find((type) => type === value) ?? "unknown";
