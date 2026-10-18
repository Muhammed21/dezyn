import { describe, expect, it } from "vitest";

import { type Typography, typographyRefusal } from "./typography.ts";

const makeTypography = (overrides: Partial<Typography> = {}): Typography => ({
  fontFamily: "Inter",
  fontSize: { value: 16, unit: "px" },
  fontWeight: 400,
  lineHeight: 1.5,
  letterSpacing: { value: 0, unit: "px" },
  ...overrides,
});

describe("la graisse d'une typographie va de 1 à 1000, ou suit un mot-clé DTCG", () => {
  const accepted: readonly Typography["fontWeight"][] = [1, 400, 1000, "bold"];

  it.each(accepted.map((fontWeight) => [fontWeight]))("accepte la graisse %j", (fontWeight) => {
    expect(typographyRefusal(makeTypography({ fontWeight }))).toBeUndefined();
  });

  it.each([[0], [1001], [-400]])("refuse la graisse %d", (fontWeight) => {
    expect(typographyRefusal(makeTypography({ fontWeight }))).toBe("font_weight_out_of_range");
  });
});

describe("la famille d'une typographie nomme au moins une police", () => {
  it.each([["Inter"], [["Inter", "sans-serif"]]])("accepte la famille %j", (fontFamily) => {
    expect(typographyRefusal(makeTypography({ fontFamily }))).toBeUndefined();
  });

  it.each([[""], [[]], [["Inter", ""]]])("refuse la famille %j", (fontFamily) => {
    expect(typographyRefusal(makeTypography({ fontFamily }))).toBe("empty_font_family");
  });
});
