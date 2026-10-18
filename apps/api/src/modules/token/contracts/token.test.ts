import { describe, expect, it } from "vitest";
import { z } from "zod";

import { TokenOutput } from "./token.ts";

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

  it.each([["id"], ["name"], ["$type"], ["status"]])("refuse un token sans %s", (field) => {
    expect(TokenOutput.safeParse(makeTokenOutput({ [field]: undefined })).success).toBe(false);
  });

  it("accepte un type et un statut ajoutés plus tard par le serveur", () => {
    expect(
      TokenOutput.safeParse(makeTokenOutput({ $type: "dimension", status: "proposed" })).success,
    ).toBe(true);
  });

  it("annonce à l'IA les types et les statuts connus", () => {
    expect(z.toJSONSchema(TokenOutput)).toMatchObject({
      properties: {
        $type: { anyOf: [{ enum: ["color"] }, { type: "string" }] },
        status: { anyOf: [{ enum: ["validated"] }, { type: "string" }] },
      },
    });
  });
});
