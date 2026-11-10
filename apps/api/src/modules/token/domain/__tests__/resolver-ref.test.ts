import { describe, expect, it } from "vitest";

import { resolverDocumentOf } from "../dtcg-document.ts";
import { readDocument } from "../dtcg-import.ts";

const MODIFIER_WITH_POINTER_CHARACTERS = "apparence/écran~v2";

const documentOf = (modifier: string) =>
  resolverDocumentOf({
    modifier,
    modes: ["clair", "sombre"],
    tokens: [{ name: "fond", $type: "color", modes: { clair: "#ffffff", sombre: "#000000" } }],
  });

describe("le $ref du modificateur suit la syntaxe JSON Pointer (ADR 0041 §3)", () => {
  it("l'export échappe ~ en ~0 et / en ~1 dans le nom du modificateur", () => {
    expect(documentOf(MODIFIER_WITH_POINTER_CHARACTERS).resolutionOrder).toEqual([
      { $ref: "#/modifiers/apparence~1écran~0v2" },
    ]);
  });

  it("un document exporté avec ce modificateur se relit sans erreur, sous son nom d'origine", () => {
    const read = readDocument(documentOf(MODIFIER_WITH_POINTER_CHARACTERS));

    expect(read.issues).toEqual([]);
    expect(read.resolver).toEqual({
      modifier: MODIFIER_WITH_POINTER_CHARACTERS,
      modes: ["clair", "sombre"],
    });
  });

  it("un $ref qui n'échappe pas le nom du modificateur est refusé", () => {
    const read = readDocument({
      ...documentOf(MODIFIER_WITH_POINTER_CHARACTERS),
      resolutionOrder: [{ $ref: `#/modifiers/${MODIFIER_WITH_POINTER_CHARACTERS}` }],
    });

    expect(read.issues).toEqual([
      { path: "resolutionOrder", message: "Le seul modificateur du document attendu" },
    ]);
  });
});
