import { describe, expect, it } from "vitest";

import { modeRefusals } from "./mode-completeness.ts";

const LIGHT_AND_DARK = ["clair", "sombre"];

describe("chaque mode du projet déclare le token (ADR 0010 §4)", () => {
  it("accepte une valeur par mode du projet", () => {
    expect(
      modeRefusals({
        projectModes: LIGHT_AND_DARK,
        sent: { value: false, modes: ["sombre", "clair"] },
      }),
    ).toEqual([]);
  });

  it("nomme chaque mode oublié", () => {
    expect(
      modeRefusals({
        projectModes: ["clair", "sombre", "contraste"],
        sent: { value: false, modes: ["clair"] },
      }),
    ).toEqual([
      { mode: "sombre", refusal: "missing_mode" },
      { mode: "contraste", refusal: "missing_mode" },
    ]);
  });

  it("nomme un mode inconnu du projet", () => {
    expect(
      modeRefusals({
        projectModes: LIGHT_AND_DARK,
        sent: { value: false, modes: ["clair", "sombre", "nuit"] },
      }),
    ).toEqual([{ mode: "nuit", refusal: "unknown_mode" }]);
  });

  it("refuse une valeur unique sur un projet à modes", () => {
    expect(
      modeRefusals({ projectModes: LIGHT_AND_DARK, sent: { value: true, modes: undefined } }),
    ).toEqual([{ refusal: "value_without_mode" }]);
  });

  it("refuse un projet à modes sans aucune valeur, en nommant chaque mode", () => {
    expect(
      modeRefusals({ projectModes: LIGHT_AND_DARK, sent: { value: false, modes: undefined } }),
    ).toEqual([
      { mode: "clair", refusal: "missing_mode" },
      { mode: "sombre", refusal: "missing_mode" },
    ]);
  });
});

describe("un projet sans modificateur a une seule valeur", () => {
  it("accepte une valeur unique", () => {
    expect(modeRefusals({ projectModes: [], sent: { value: true, modes: undefined } })).toEqual([]);
  });

  it("refuse des valeurs par mode", () => {
    expect(modeRefusals({ projectModes: [], sent: { value: false, modes: ["clair"] } })).toEqual([
      { refusal: "modes_without_modifier" },
    ]);
  });

  it("refuse l'absence de valeur", () => {
    expect(modeRefusals({ projectModes: [], sent: { value: false, modes: undefined } })).toEqual([
      { refusal: "missing_value" },
    ]);
  });
});
