export const returnPathOf = (value: unknown): string | undefined =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.startsWith("/\\")
    ? value
    : undefined;
