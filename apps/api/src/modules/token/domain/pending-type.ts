const PENDING_TYPES: readonly string[] = [
  "duration",
  "cubicBezier",
  "transition",
  "border",
  "strokeStyle",
];

export const pendingTypeOf = (type: unknown): string | undefined =>
  typeof type === "string" && PENDING_TYPES.includes(type) ? type : undefined;
