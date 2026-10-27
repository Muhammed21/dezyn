import { describe, expect, it } from "vitest";

import { dtcgDocumentOf } from "./dtcg-document.ts";

describe("un token du document DTCG ne porte que ses champs présents (ADR 0039 §2)", () => {
  it("un token sans description ni extensions n'a que $type et $value", () => {
    expect(dtcgDocumentOf([{ name: "couleur", $type: "color", $value: "#ffffff" }])).toStrictEqual({
      couleur: { $type: "color", $value: "#ffffff" },
    });
  });

  it("un token avec description et extensions les garde", () => {
    const $extensions = { "com.figma": { italic: true } };

    expect(
      dtcgDocumentOf([
        { name: "couleur", $type: "color", $value: "#ffffff", $description: "Fond", $extensions },
      ]),
    ).toStrictEqual({
      couleur: { $type: "color", $value: "#ffffff", $description: "Fond", $extensions },
    });
  });
});
