import { describe, expect, it } from "vitest";

import { sameDefinition } from "./same-definition.ts";

const BLUE = { colorSpace: "srgb", components: [0.2, 0.4, 0.8] };

const NIGHT = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

describe("une écriture identique à la valeur validée ne change rien (ADR 0013 §5)", () => {
  it("reconnaît la même valeur", () => {
    expect(sameDefinition({ $value: BLUE }, { $value: { ...BLUE } })).toBe(true);
  });

  it("ne tient pas compte de l'ordre des clés", () => {
    expect(
      sameDefinition(
        { $value: { colorSpace: "srgb", components: [0.2, 0.4, 0.8] } },
        { $value: { components: [0.2, 0.4, 0.8], colorSpace: "srgb" } },
      ),
    ).toBe(true);
  });

  it("voit une composante qui change", () => {
    expect(
      sameDefinition({ $value: BLUE }, { $value: { ...BLUE, components: [0.2, 0.4, 0.9] } }),
    ).toBe(false);
  });

  it("voit une clé en plus", () => {
    expect(sameDefinition({ $value: BLUE }, { $value: { ...BLUE, alpha: 1 } })).toBe(false);
  });

  it("voit l'ordre d'une liste", () => {
    expect(
      sameDefinition(
        { $value: { fontFamily: ["Inter", "sans-serif"] } },
        { $value: { fontFamily: ["sans-serif", "Inter"] } },
      ),
    ).toBe(false);
  });

  it("distingue une valeur seule d'une liste d'une valeur", () => {
    expect(
      sameDefinition({ $value: { fontFamily: "Inter" } }, { $value: { fontFamily: ["Inter"] } }),
    ).toBe(false);
  });

  it("compare un alias à un alias", () => {
    expect(sameDefinition({ $value: "{couleur.bleu}" }, { $value: "{couleur.bleu}" })).toBe(true);
    expect(sameDefinition({ $value: "{couleur.bleu}" }, { $value: "{couleur.marine}" })).toBe(
      false,
    );
  });

  it("compare mode par mode", () => {
    expect(
      sameDefinition(
        { modes: { clair: BLUE, sombre: NIGHT } },
        { modes: { sombre: NIGHT, clair: BLUE } },
      ),
    ).toBe(true);
    expect(
      sameDefinition(
        { modes: { clair: BLUE, sombre: NIGHT } },
        { modes: { clair: BLUE, sombre: BLUE } },
      ),
    ).toBe(false);
  });

  it("voit une description qui change, apparaît ou disparaît", () => {
    expect(
      sameDefinition(
        { $value: BLUE, $description: "Fond" },
        { $value: BLUE, $description: "Fond" },
      ),
    ).toBe(true);
    expect(
      sameDefinition(
        { $value: BLUE, $description: "Fond" },
        { $value: BLUE, $description: "Texte" },
      ),
    ).toBe(false);
    expect(sameDefinition({ $value: BLUE }, { $value: BLUE, $description: "Fond" })).toBe(false);
    expect(sameDefinition({ $value: BLUE, $description: "Fond" }, { $value: BLUE })).toBe(false);
  });

  it("distingue un nombre d'une chaîne, et une valeur absente de null", () => {
    expect(sameDefinition({ $value: { value: 16 } }, { $value: { value: "16" } })).toBe(false);
    expect(sameDefinition({ $value: { alpha: null } }, { $value: {} })).toBe(false);
  });

  it("reconnaît null des deux côtés", () => {
    expect(sameDefinition({ $value: { alpha: null } }, { $value: { alpha: null } })).toBe(true);
  });

  it("distingue une liste d'une chaîne de même longueur", () => {
    expect(sameDefinition({ $value: { fontFamily: ["A"] } }, { $value: { fontFamily: "A" } })).toBe(
      false,
    );
  });

  it("voit une liste plus longue", () => {
    expect(
      sameDefinition(
        { $value: { fontFamily: ["Inter"] } },
        { $value: { fontFamily: ["Inter", "sans-serif"] } },
      ),
    ).toBe(false);
  });

  it("distingue un objet vide d'une liste vide", () => {
    expect(sameDefinition({ $value: {} }, { $value: [] })).toBe(false);
  });
});
