import { describe, expect, it } from "vitest";

import { colorRefusal, type SrgbColor } from "./color.ts";

const makeColor = (overrides: Partial<SrgbColor> = {}): SrgbColor => ({
  colorSpace: "srgb",
  components: [0.2, 0.4, 0.8],
  ...overrides,
});

describe("une couleur sRGB a ses composantes entre 0 et 1 (ADR 0010, module Color de DTCG 2025.10)", () => {
  it("accepte des composantes entre 0 et 1, bornes comprises", () => {
    expect(colorRefusal(makeColor({ components: [0, 0.5, 1] }))).toBeUndefined();
  });

  const outOfRange: readonly SrgbColor["components"][] = [
    [-0.01, 0.5, 0.5],
    [0.5, 1.01, 0.5],
    [0.5, 0.5, 2],
  ];

  it.each(outOfRange.map((components) => [components]))(
    "refuse les composantes %j",
    (components) => {
      expect(colorRefusal(makeColor({ components }))).toBe("component_out_of_range");
    },
  );
});

describe("l'alpha d'une couleur est facultatif et compris entre 0 et 1", () => {
  it.each([[0], [0.5], [1]])("accepte un alpha de %d", (alpha) => {
    expect(colorRefusal(makeColor({ alpha }))).toBeUndefined();
  });

  it.each([[-0.01], [1.01]])("refuse un alpha de %d", (alpha) => {
    expect(colorRefusal(makeColor({ alpha }))).toBe("alpha_out_of_range");
  });
});

describe("le hex d'une couleur est facultatif et correspond à ses composantes", () => {
  it.each([["#3366cc"], ["#3366CC"]])("accepte %s pour les composantes 0.2, 0.4, 0.8", (hex) => {
    expect(colorRefusal(makeColor({ hex }))).toBeUndefined();
  });

  it("écrit chaque composante sur deux chiffres", () => {
    expect(colorRefusal(makeColor({ components: [0, 0.02, 1], hex: "#0005ff" }))).toBeUndefined();
  });

  it("arrondit chaque composante à l'entier le plus proche sur 255", () => {
    expect(
      colorRefusal(makeColor({ components: [0.501, 0.499, 1], hex: "#807fff" })),
    ).toBeUndefined();
  });

  it.each([["3366cc"], ["#36c"], ["#3366ccff"], ["#3366cg"], [" #3366cc"], ["#3366cc "]])(
    "refuse le hex mal formé %j",
    (hex) => {
      expect(colorRefusal(makeColor({ hex }))).toBe("malformed_hex");
    },
  );

  it("refuse un hex qui ne correspond pas aux composantes", () => {
    expect(colorRefusal(makeColor({ hex: "#3366cd" }))).toBe("hex_mismatch");
  });
});
