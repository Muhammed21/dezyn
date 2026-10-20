import { describe, expect, it } from "vitest";

import { referencedNames } from "./field-references.ts";
import { aliasName, type ProjectToken, resolveReference } from "./reference.ts";

const makeProjectToken = (overrides: Partial<ProjectToken> = {}): ProjectToken => ({
  id: "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "couleur.bleu.500",
  $type: "color",
  status: "validated",
  ...overrides,
});

describe("un alias DTCG nomme un token entre accolades (ADR 0010 §1)", () => {
  it("lit le nom d'un alias", () => {
    expect(aliasName("{couleur.bleu.500}")).toBe("couleur.bleu.500");
  });

  it.each([
    ["couleur.bleu.500"],
    ["{couleur.bleu.500"],
    ["couleur.bleu.500}"],
    ["{}"],
    ["{couleur..bleu}"],
    ["{{couleur}}"],
    ["x{couleur}"],
    ["{couleur}x"],
  ])("refuse l'alias mal formé %j", (value) => {
    expect(aliasName(value)).toBeUndefined();
  });

  it.each([[["{police.base}"]], [{ name: "{police.base}" }], [400]])(
    "ne lit pas d'alias dans une valeur qui n'est pas une chaîne : %j",
    (value) => {
      expect(aliasName(value)).toBeUndefined();
    },
  );
});

describe("une référence vise un token validé du même type, dans le même projet", () => {
  it("résout la référence vers le token visé", () => {
    const target = makeProjectToken();

    expect(
      resolveReference({ name: "couleur.bleu.500", $type: "color", tokens: [target] }),
    ).toEqual({ tokenId: target.id });
  });

  it("choisit le token qui porte le nom, parmi d'autres", () => {
    const target = makeProjectToken({ id: "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b" });

    expect(
      resolveReference({
        name: "couleur.bleu.500",
        $type: "color",
        tokens: [makeProjectToken({ name: "couleur.bleu.700" }), target],
      }),
    ).toEqual({ tokenId: target.id });
  });

  it("refuse un token inexistant", () => {
    expect(
      resolveReference({ name: "couleur.rouge", $type: "color", tokens: [makeProjectToken()] }),
    ).toEqual({ refusal: "unknown_reference" });
  });

  it("refuse un token qui n'est pas validé", () => {
    expect(
      resolveReference({
        name: "couleur.bleu.500",
        $type: "color",
        tokens: [makeProjectToken({ status: "proposed" })],
      }),
    ).toEqual({ refusal: "unvalidated_reference" });
  });

  it("refuse un token d'un autre type", () => {
    expect(
      resolveReference({
        name: "couleur.bleu.500",
        $type: "dimension",
        tokens: [makeProjectToken()],
      }),
    ).toEqual({ refusal: "type_mismatch" });
  });
});

describe("une référence peut viser un token de la même écriture de l'IA", () => {
  it("résout la référence vers un token écrit avec elle, sans token validé", () => {
    expect(
      resolveReference({
        name: "couleur.bleu.500",
        $type: "color",
        tokens: [],
        written: [{ name: "couleur.bleu.500", $type: "color" }],
      }),
    ).toEqual({ written: "couleur.bleu.500" });
  });

  it("refuse un token écrit avec elle d'un autre type", () => {
    expect(
      resolveReference({
        name: "espacement.moyen",
        $type: "color",
        tokens: [],
        written: [{ name: "espacement.moyen", $type: "dimension" }],
      }),
    ).toEqual({ refusal: "type_mismatch" });
  });

  it("cherche parmi les tokens écrits celui qui porte le nom", () => {
    expect(
      resolveReference({
        name: "couleur.bleu.500",
        $type: "color",
        tokens: [makeProjectToken({ name: "couleur.bleu.500", status: "proposed" })],
        written: [
          { name: "couleur.bleu.700", $type: "color" },
          { name: "couleur.bleu.500", $type: "color" },
        ],
      }),
    ).toEqual({ written: "couleur.bleu.500" });
  });
});

describe("une référence vers un token encore proposé n'est pas validée", () => {
  it("refuse un token qui n'existe qu'en proposition", () => {
    expect(
      resolveReference({
        name: "couleur.bleu.500",
        $type: "color",
        tokens: [],
        pending: [{ name: "couleur.bleu.500", $type: "color" }],
      }),
    ).toEqual({ refusal: "unvalidated_reference" });
  });

  it("garde inexistant un token absent des propositions en attente", () => {
    expect(
      resolveReference({
        name: "couleur.bleu.500",
        $type: "color",
        tokens: [],
        pending: [{ name: "couleur.bleu.700", $type: "color" }],
      }),
    ).toEqual({ refusal: "unknown_reference" });
  });
});

describe("un token nomme les tokens qu'il référence, par sa valeur ou par mode", () => {
  const PRIMARY_BLUE = { colorSpace: "srgb", components: [0.2, 0.4, 0.8] };

  it("une valeur directe ne référence rien", () => {
    expect(referencedNames({ $type: "color", $value: PRIMARY_BLUE })).toEqual([]);
  });

  it("un alias en valeur nomme sa cible", () => {
    expect(referencedNames({ $type: "color", $value: "{couleur.bleu.500}" })).toEqual([
      "couleur.bleu.500",
    ]);
  });

  it("chaque alias par mode nomme sa cible, et les valeurs directes ne comptent pas", () => {
    expect(
      referencedNames({
        $type: "color",
        modes: { clair: "{couleur.bleu.500}", sombre: PRIMARY_BLUE, contraste: "{couleur.noir}" },
      }),
    ).toEqual(["couleur.bleu.500", "couleur.noir"]);
  });

  it("un texte qui n'est pas un alias ne référence rien", () => {
    expect(referencedNames({ $type: "color", $value: "bleu" })).toEqual([]);
  });
});
