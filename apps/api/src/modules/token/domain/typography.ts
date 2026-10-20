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

export type FontFamily = string | readonly string[];

export type FontWeight = number | (typeof FONT_WEIGHT_KEYWORDS)[number];

export type Typography = {
  readonly fontFamily: FontFamily;
  readonly fontSize: Dimension;
  readonly fontWeight: FontWeight;
  readonly lineHeight: number;
  readonly letterSpacing: Dimension;
};

export type FontFamilyRefusal = "empty_font_family";

export type FontWeightRefusal = "font_weight_out_of_range";

export type TypographyRefusal = FontFamilyRefusal | FontWeightRefusal;

const families = (fontFamily: FontFamily): readonly string[] =>
  typeof fontFamily === "string" ? [fontFamily] : fontFamily;

export const fontFamilyRefusal = (fontFamily: FontFamily): FontFamilyRefusal | undefined => {
  const named = families(fontFamily);
  return named.length === 0 || named.includes("") ? "empty_font_family" : undefined;
};

export const fontWeightRefusal = (fontWeight: FontWeight): FontWeightRefusal | undefined =>
  typeof fontWeight === "number" && (fontWeight < 1 || fontWeight > 1000)
    ? "font_weight_out_of_range"
    : undefined;

export const typographyRefusal = ({
  fontFamily,
  fontWeight,
}: Typography): TypographyRefusal | undefined =>
  fontFamilyRefusal(fontFamily) ?? fontWeightRefusal(fontWeight);
