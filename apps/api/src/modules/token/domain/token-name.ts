export type TokenNameRefusal = "empty_segment" | "dollar_prefix" | "brace";

const segmentRefusal = (segment: string): TokenNameRefusal | undefined => {
  if (segment === "") {
    return "empty_segment";
  }
  if (segment.startsWith("$")) {
    return "dollar_prefix";
  }
  return segment.includes("{") || segment.includes("}") ? "brace" : undefined;
};

export const tokenNameRefusal = (name: string): TokenNameRefusal | undefined =>
  name
    .split(".")
    .map(segmentRefusal)
    .find((refusal) => refusal !== undefined);
