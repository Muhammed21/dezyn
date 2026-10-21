import { describe, expect, it } from "vitest";

import type { SrgbColor } from "./color.ts";
import { type GradientStop, gradientRefusals } from "./gradient.ts";

const BLUE: SrgbColor = { colorSpace: "srgb", components: [0, 0.4, 1] };

const makeStop = (overrides: Partial<GradientStop> = {}): GradientStop => ({
  color: BLUE,
  position: 0,
  ...overrides,
});

describe("un dégradé a au moins un arrêt, chacun placé de 0 à 1 (ADR 0028 §1)", () => {
  it("accepte des arrêts aux bornes 0 et 1", () => {
    expect(gradientRefusals([makeStop({ position: 0 }), makeStop({ position: 1 })])).toEqual([]);
  });

  it("refuse un dégradé sans arrêt", () => {
    expect(gradientRefusals([])).toEqual([{ refusal: "no_stop" }]);
  });

  it.each([[-0.01], [1.01]])("refuse une position %s, en désignant l'arrêt", (position) => {
    expect(gradientRefusals([makeStop(), makeStop({ position })])).toEqual([
      { stop: 1, refusal: "position_out_of_range" },
    ]);
  });

  it("refuse la couleur invalide d'un arrêt, en désignant l'arrêt", () => {
    expect(
      gradientRefusals([makeStop({ color: { ...BLUE, components: [0, 0.4, 1.2] } }), makeStop()]),
    ).toEqual([{ stop: 0, refusal: "component_out_of_range" }]);
  });
});
