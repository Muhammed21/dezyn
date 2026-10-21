export type Extensions = Readonly<Record<string, unknown>>;

export type ExtensionsRefusal =
  | { readonly key: string; readonly refusal: "malformed_key" }
  | { readonly refusal: "too_large" };

export const MAX_EXTENSIONS_BYTES = 16 * 1024;

export const isExtensions = (value: unknown): value is Extensions =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const REVERSE_DOMAIN = /^[^.]+(?:\.[^.]+)+$/u;

const serializedBytes = (extensions: Extensions): number =>
  new TextEncoder().encode(JSON.stringify(extensions)).length;

const TOO_LARGE: readonly ExtensionsRefusal[] = [{ refusal: "too_large" }];

export const extensionsRefusals = (extensions: Extensions): readonly ExtensionsRefusal[] => [
  ...Object.keys(extensions)
    .filter((key) => !REVERSE_DOMAIN.test(key))
    .map((key): ExtensionsRefusal => ({ key, refusal: "malformed_key" })),
  ...(serializedBytes(extensions) > MAX_EXTENSIONS_BYTES ? TOO_LARGE : []),
];
