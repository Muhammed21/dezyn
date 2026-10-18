import { describe, expect, it } from "vitest";

import type { SrgbColor } from "./color.ts";
import { type ShadowLayer, shadowRefusals } from "./shadow.ts";

const makeLayer = (overrides: Partial<ShadowLayer> = {}): ShadowLayer => ({
  color: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.25 },
  offsetX: { value: 0, unit: "px" },
  offsetY: { value: 2, unit: "px" },
  blur: { value: 4, unit: "px" },
  spread: { value: 0, unit: "px" },
  ...overrides,
});

describe("une ombre a une ou plusieurs couches valides (ADR 0010 §1)", () => {
  it("accepte une couche seule", () => {
    expect(shadowRefusals(makeLayer())).toEqual([]);
  });

  it("accepte plusieurs couches, dont une intérieure", () => {
    expect(shadowRefusals([makeLayer(), makeLayer({ inset: true })])).toEqual([]);
  });

  it("refuse une ombre sans couche", () => {
    expect(shadowRefusals([])).toEqual([{ refusal: "no_layer" }]);
  });

  it("accepte un flou nul", () => {
    expect(shadowRefusals(makeLayer({ blur: { value: 0, unit: "px" } }))).toEqual([]);
  });

  it("refuse un flou négatif, en désignant la couche", () => {
    expect(shadowRefusals([makeLayer(), makeLayer({ blur: { value: -1, unit: "rem" } })])).toEqual([
      { layer: 1, refusal: "negative_blur" },
    ]);
  });

  it("refuse le flou négatif d'une couche seule, sans numéro de couche", () => {
    expect(shadowRefusals(makeLayer({ blur: { value: -1, unit: "px" } }))).toEqual([
      { refusal: "negative_blur" },
    ]);
  });

  it("refuse une couleur invalide, en désignant la couche", () => {
    const color: SrgbColor = { colorSpace: "srgb", components: [0, 0, 2] };

    expect(shadowRefusals([makeLayer({ color })])).toEqual([
      { layer: 0, refusal: "component_out_of_range" },
    ]);
  });
});
