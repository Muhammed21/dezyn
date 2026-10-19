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

const makePropositionOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "couleur.fond.primaire",
  kind: "create",
  status: "proposed",
  lot: { id: "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", state: "open" },
  token: {
    name: "couleur.fond.primaire",
    $type: "color",
    $value: { colorSpace: "srgb", components: [0.2, 0.4, 0.8] },
  },
  ...overrides,
});

describe("la lecture des tokens rend aussi les propositions en attente, sur demande (ADR 0012 §6)", () => {
  it("décode les propositions en attente avec leur lot", () => {
    const read = { modes: [], tokens: [], propositions: [makePropositionOutput()] };

    expect(TokensOutput.parse(read)).toEqual(read);
  });

  it("une lecture sans propositions reste valide", () => {
    expect(TokensOutput.parse({ modes: [], tokens: [] })).toEqual({ modes: [], tokens: [] });
  });

  it.each([["id"], ["name"], ["kind"], ["status"], ["lot"], ["token"]])(
    "refuse une proposition sans %s",
    (field) => {
      expect(
        TokensOutput.safeParse({
          modes: [],
          tokens: [],
          propositions: [makePropositionOutput({ [field]: undefined })],
        }).success,
      ).toBe(false);
    },
  );

  it.each([["id"], ["state"]])("refuse un lot sans %s", (field) => {
    expect(
      TokensOutput.safeParse({
        modes: [],
        tokens: [],
        propositions: [
          makePropositionOutput({
            lot: { id: "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", state: "open", [field]: undefined },
          }),
        ],
      }).success,
    ).toBe(false);
  });

  it.each([["name"], ["$type"]])("refuse une proposition dont le token n'a pas de %s", (field) => {
    const { token } = makePropositionOutput();

    expect(
      TokensOutput.safeParse({
        modes: [],
        tokens: [],
        propositions: [makePropositionOutput({ token: { ...token, [field]: undefined } })],
      }).success,
    ).toBe(false);
  });

  it("accepte une nature, un statut et un état de lot ajoutés plus tard par le serveur", () => {
    const read = {
      modes: [],
      tokens: [],
      propositions: [
        makePropositionOutput({
          kind: "delete",
          status: "rejected",
          lot: { id: "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", state: "archived" },
        }),
      ],
    };

    expect(TokensOutput.parse(read)).toEqual(read);
  });

  it("annonce à l'IA les natures, statuts et états connus", () => {
    expect(z.toJSONSchema(TokensOutput)).toMatchObject({
      properties: {
        propositions: {
          items: {
            properties: {
              kind: { anyOf: [{ enum: ["create", "update"] }, { type: "string" }] },
              status: { anyOf: [{ enum: ["proposed"] }, { type: "string" }] },
              token: {
                properties: {
                  $type: {
                    anyOf: [
                      { enum: ["color", "dimension", "typography", "shadow"] },
                      { type: "string" },
                    ],
                  },
                },
              },
              lot: {
                properties: {
                  state: { anyOf: [{ enum: ["open", "closed"] }, { type: "string" }] },
                },
              },
            },
          },
        },
      },
    });
  });
});
