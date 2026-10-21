import { describe, expect, it } from "vitest";

import { extensionsRefusals, isExtensions, MAX_EXTENSIONS_BYTES } from "./extensions.ts";

const SERIALIZED_OVERHEAD = JSON.stringify({ "com.figma": { note: "" } }).length;

const makeExtensionsOfBytes = (bytes: number) => ({
  "com.figma": { note: "x".repeat(bytes - SERIALIZED_OVERHEAD) },
});

describe("les extensions d'un token (ADR 0030 §1)", () => {
  it("acceptent des clés en notation de domaine inversé, au contenu libre", () => {
    expect(extensionsRefusals({ "com.figma": { italic: true }, "org.example.tool": [1] })).toEqual(
      [],
    );
  });

  it.each(["figma", "com.", ".figma", "com..figma", "", ".com.figma", "com.figma."])(
    "refusent la clé « %s »",
    (key) => {
      expect(extensionsRefusals({ "com.figma": {}, [key]: {} })).toEqual([
        { key, refusal: "malformed_key" },
      ]);
    },
  );

  it("acceptent 16 Ko sérialisés", () => {
    expect(extensionsRefusals(makeExtensionsOfBytes(MAX_EXTENSIONS_BYTES))).toEqual([]);
  });

  it("refusent plus de 16 Ko sérialisés", () => {
    expect(extensionsRefusals(makeExtensionsOfBytes(MAX_EXTENSIONS_BYTES + 1))).toEqual([
      { refusal: "too_large" },
    ]);
  });

  it("comptent les octets, pas les caractères", () => {
    expect(extensionsRefusals({ "com.figma": { note: "é".repeat(8 * 1024) } })).toEqual([
      { refusal: "too_large" },
    ]);
  });

  it("fixent le plafond à 16 Ko", () => {
    expect(MAX_EXTENSIONS_BYTES).toBe(16 * 1024);
  });

  it("se reconnaissent à un objet", () => {
    expect(isExtensions({ "com.figma": {} })).toBe(true);
  });

  it.each([
    ["une chaîne", "com.figma"],
    ["une liste", []],
    ["nul", null],
  ])("ne sont pas %s", (_case, value) => {
    expect(isExtensions(value)).toBe(false);
  });
});
