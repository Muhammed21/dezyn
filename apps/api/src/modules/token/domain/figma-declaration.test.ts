import { describe, expect, it } from "vitest";

import { checkFigmaDeclaration } from "./figma-declaration.ts";

const FOND = { id: "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", name: "couleur.fond" };

const BORD = { id: "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", name: "couleur.bord" };

describe("l'IA déclare l'état Figma des tokens du projet (ADR 0024 §1, §2)", () => {
  it("chaque entrée vise un token du projet par son nom", () => {
    expect(
      checkFigmaDeclaration({
        entries: [
          { name: "couleur.bord", state: "missing_in_figma" },
          { name: "couleur.fond", state: "synced" },
        ],
        tokens: [FOND, BORD],
      }),
    ).toEqual({
      states: [
        { tokenId: BORD.id, name: "couleur.bord", state: "missing_in_figma" },
        { tokenId: FOND.id, name: "couleur.fond", state: "synced" },
      ],
    });
  });
});

describe("une déclaration invalide est refusée en entier, entrée par entrée", () => {
  it("refuse un token inconnu du projet", () => {
    expect(
      checkFigmaDeclaration({
        entries: [
          { name: "couleur.fond", state: "synced" },
          { name: "couleur.inconnue", state: "synced" },
        ],
        tokens: [FOND],
      }),
    ).toEqual({ refusals: [{ index: 1, refusal: "unknown_token" }] });
  });

  it.each([["en_retard"], [""], ["diverged"]])(
    "refuse l'état %j, qui n'est pas un état déclarable",
    (state) => {
      expect(
        checkFigmaDeclaration({ entries: [{ name: "couleur.fond", state }], tokens: [FOND] }),
      ).toEqual({ refusals: [{ index: 0, refusal: "unknown_state" }] });
    },
  );

  it("refuse un token nommé deux fois dans la déclaration", () => {
    expect(
      checkFigmaDeclaration({
        entries: [
          { name: "couleur.fond", state: "synced" },
          { name: "couleur.bord", state: "synced" },
          { name: "couleur.fond", state: "missing_in_figma" },
        ],
        tokens: [FOND, BORD],
      }),
    ).toEqual({ refusals: [{ index: 2, refusal: "duplicate_name" }] });
  });

  it("liste chaque entrée en erreur, et un token inconnu dans un état inconnu compte deux fois", () => {
    expect(
      checkFigmaDeclaration({
        entries: [
          { name: "couleur.inconnue", state: "en_retard" },
          { name: "couleur.fond", state: "synced" },
          { name: "couleur.bord", state: "en_retard" },
        ],
        tokens: [FOND, BORD],
      }),
    ).toEqual({
      refusals: [
        { index: 0, refusal: "unknown_token" },
        { index: 0, refusal: "unknown_state" },
        { index: 2, refusal: "unknown_state" },
      ],
    });
  });
});

describe("un doublon dans Figma nomme au moins deux variables Figma (ADR 0024 §2)", () => {
  it("garde les variables Figma d'un doublon dans Figma", () => {
    expect(
      checkFigmaDeclaration({
        entries: [
          {
            name: "couleur.fond",
            state: "duplicate_in_figma",
            figmaVariables: ["Couleurs/Fond", "Legacy/Fond"],
          },
        ],
        tokens: [FOND],
      }),
    ).toEqual({
      states: [
        {
          tokenId: FOND.id,
          name: "couleur.fond",
          state: "duplicate_in_figma",
          figmaVariables: ["Couleurs/Fond", "Legacy/Fond"],
        },
      ],
    });
  });

  it.each([
    ["sans variables", undefined],
    ["sans aucune variable", []],
    ["avec une seule variable", ["Couleurs/Fond"]],
    ["avec deux fois la même variable", ["Couleurs/Fond", "Couleurs/Fond"]],
    ["avec une variable sans nom", ["Couleurs/Fond", ""]],
  ])("refuse un doublon dans Figma %s", (_, figmaVariables) => {
    expect(
      checkFigmaDeclaration({
        entries: [{ name: "couleur.fond", state: "duplicate_in_figma", figmaVariables }],
        tokens: [FOND],
      }),
    ).toEqual({ refusals: [{ index: 0, refusal: "too_few_figma_variables" }] });
  });

  it("accepte trois variables, dont deux identiques, tant que deux sont distinctes", () => {
    expect(
      checkFigmaDeclaration({
        entries: [
          {
            name: "couleur.fond",
            state: "duplicate_in_figma",
            figmaVariables: ["Couleurs/Fond", "Couleurs/Fond", "Legacy/Fond"],
          },
        ],
        tokens: [FOND],
      }),
    ).toMatchObject({ states: [{ state: "duplicate_in_figma" }] });
  });

  it.each([["synced"], ["missing_in_figma"]])(
    "refuse des variables Figma sur l'état %s",
    (state) => {
      expect(
        checkFigmaDeclaration({
          entries: [
            { name: "couleur.fond", state, figmaVariables: ["Couleurs/Fond", "Legacy/Fond"] },
          ],
          tokens: [FOND],
        }),
      ).toEqual({ refusals: [{ index: 0, refusal: "figma_variables_without_duplicate" }] });
    },
  );
});

describe("un état inconnu n'est refusé qu'une fois, même avec des variables Figma", () => {
  it("refuse l'état seul, sans juger ses variables Figma", () => {
    expect(
      checkFigmaDeclaration({
        entries: [
          {
            name: "couleur.fond",
            state: "en_retard",
            figmaVariables: ["Couleurs/Fond", "Legacy/Fond"],
          },
        ],
        tokens: [FOND],
      }),
    ).toEqual({ refusals: [{ index: 0, refusal: "unknown_state" }] });
  });
});
