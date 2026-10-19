import { describe, expect, it } from "vitest";
import { z } from "zod";

import { TokenOutput, TokensOutput } from "./token.ts";

const makeTokenOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "couleur.fond.primaire",
  $type: "color",
  $value: { colorSpace: "srgb", components: [0.2, 0.4, 0.8] },
  $description: "Fond des boutons",
  status: "validated",
  ...overrides,
});

describe("le contrat de sortie d'un token reste ouvert (ADR 0023)", () => {
  it("décode un token validé", () => {
    const token = makeTokenOutput();

    expect(TokenOutput.parse(token)).toEqual(token);
  });

  it("décode un token à modes, sans $value", () => {
    const token = {
      id: "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
      name: "couleur.fond.primaire",
      $type: "color",
      modes: { clair: "{couleur.bleu}", sombre: "{couleur.marine}" },
      status: "validated",
    };

    expect(TokensOutput.safeParse({ modes: ["clair", "sombre"], tokens: [token] }).success).toBe(
      true,
    );
  });

  it.each([["id"], ["name"], ["$type"], ["status"]])("refuse un token sans %s", (field) => {
    expect(TokenOutput.safeParse(makeTokenOutput({ [field]: undefined })).success).toBe(false);
  });

  it("accepte un type et un statut ajoutés plus tard par le serveur", () => {
    expect(
      TokenOutput.safeParse(makeTokenOutput({ $type: "duration", status: "proposed" })).success,
    ).toBe(true);
  });

  it("annonce à l'IA les types et les statuts connus", () => {
    expect(z.toJSONSchema(TokenOutput)).toMatchObject({
      properties: {
        $type: {
          anyOf: [{ enum: ["color", "dimension", "typography", "shadow"] }, { type: "string" }],
        },
        status: { anyOf: [{ enum: ["validated"] }, { type: "string" }] },
        modes: { type: "object", propertyNames: { type: "string" } },
      },
    });
  });
});

describe("la lecture des tokens d'un projet rend ses modes et ses tokens (ADR 0023)", () => {
  it("décode les modes et les tokens, et garde un champ ajouté plus tard", () => {
    const read = { modes: ["clair", "sombre"], tokens: [makeTokenOutput()], groups: [] };

    expect(TokensOutput.parse(read)).toEqual(read);
  });

  it.each([["modes"], ["tokens"]])("refuse une lecture sans %s", (field) => {
    const read = { modes: [], tokens: [], [field]: undefined };

    expect(TokensOutput.safeParse(read).success).toBe(false);
  });

  it("refuse un token sans nom dans la lecture", () => {
    const read = { modes: [], tokens: [makeTokenOutput({ name: undefined })] };

    expect(TokensOutput.safeParse(read).success).toBe(false);
  });
});
