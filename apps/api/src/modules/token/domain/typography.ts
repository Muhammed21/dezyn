import type { Dimension } from "./dimension.ts";

export const FONT_WEIGHT_KEYWORDS = [
  "thin",
  "hairline",
  "extra-light",
  "ultra-light",
  "light",
  "normal",
  "regular",
  "book",
  "medium",
  "semi-bold",
  "demi-bold",
  "bold",
  "extra-bold",
  "ultra-bold",
  "black",
  "heavy",
  "extra-black",
  "ultra-black",
] as const;

export type Typography = {
  readonly fontFamily: string | readonly string[];
  readonly fontSize: Dimension;
  readonly fontWeight: number | (typeof FONT_WEIGHT_KEYWORDS)[number];
  readonly lineHeight: number;
  readonly letterSpacing: Dimension;
};

export type TypographyRefusal = "font_weight_out_of_range" | "empty_font_family";

const families = (fontFamily: Typography["fontFamily"]): readonly string[] =>
  typeof fontFamily === "string" ? [fontFamily] : fontFamily;

export const typographyRefusal = ({
  fontFamily,
  fontWeight,
}: Typography): TypographyRefusal | undefined => {
  const named = families(fontFamily);
  if (named.length === 0 || named.includes("")) {
    return "empty_font_family";
  }
  return typeof fontWeight === "number" && (fontWeight < 1 || fontWeight > 1000)
    ? "font_weight_out_of_range"
    : undefined;
};
