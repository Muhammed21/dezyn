import { describe, expect, it } from "vitest";

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
