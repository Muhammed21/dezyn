import { describe, expect, it } from "vitest";
import { z } from "zod";

import { DeclaredFigmaStatesOutput, TokenOutput, TokensOutput } from "./token.ts";

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
          anyOf: [
            {
              enum: [
                "color",
                "dimension",
                "typography",
                "shadow",
                "gradient",
                "fontFamily",
                "fontWeight",
                "number",
              ],
            },
            { type: "string" },
          ],
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

const makeProposalOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "couleur.fond.primaire",
  kind: "create",
  status: "proposed",
  batch: { id: "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", state: "open" },
  token: {
    name: "couleur.fond.primaire",
    $type: "color",
    $value: { colorSpace: "srgb", components: [0.2, 0.4, 0.8] },
  },
  ...overrides,
});

describe("la lecture des tokens rend aussi les propositions en attente, sur demande (ADR 0012 §6)", () => {
  it("décode les propositions en attente avec leur lot", () => {
    const read = { modes: [], tokens: [], proposals: [makeProposalOutput()] };

    expect(TokensOutput.parse(read)).toEqual(read);
  });

  it("une lecture sans propositions reste valide", () => {
    expect(TokensOutput.parse({ modes: [], tokens: [] })).toEqual({ modes: [], tokens: [] });
  });

  it.each([["id"], ["name"], ["kind"], ["status"], ["batch"], ["token"]])(
    "refuse une proposition sans %s",
    (field) => {
      expect(
        TokensOutput.safeParse({
          modes: [],
          tokens: [],
          proposals: [makeProposalOutput({ [field]: undefined })],
        }).success,
      ).toBe(false);
    },
  );

  it.each([["id"], ["state"]])("refuse un lot sans %s", (field) => {
    expect(
      TokensOutput.safeParse({
        modes: [],
        tokens: [],
        proposals: [
          makeProposalOutput({
            batch: {
              id: "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
              state: "open",
              [field]: undefined,
            },
          }),
        ],
      }).success,
    ).toBe(false);
  });

  it.each([["name"], ["$type"]])("refuse une proposition dont le token n'a pas de %s", (field) => {
    const { token } = makeProposalOutput();

    expect(
      TokensOutput.safeParse({
        modes: [],
        tokens: [],
        proposals: [makeProposalOutput({ token: { ...token, [field]: undefined } })],
      }).success,
    ).toBe(false);
  });

  it("accepte une nature, un statut et un état de lot ajoutés plus tard par le serveur", () => {
    const read = {
      modes: [],
      tokens: [],
      proposals: [
        makeProposalOutput({
          kind: "delete",
          status: "rejected",
          batch: { id: "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", state: "archived" },
        }),
      ],
    };

    expect(TokensOutput.parse(read)).toEqual(read);
  });

  it("annonce à l'IA les natures, statuts et états connus", () => {
    expect(z.toJSONSchema(TokensOutput)).toMatchObject({
      properties: {
        proposals: {
          items: {
            properties: {
              kind: { anyOf: [{ enum: ["create", "update"] }, { type: "string" }] },
              status: { anyOf: [{ enum: ["proposed"] }, { type: "string" }] },
              token: {
                properties: {
                  $type: {
                    anyOf: [
                      {
                        enum: [
                          "color",
                          "dimension",
                          "typography",
                          "shadow",
                          "gradient",
                          "fontFamily",
                          "fontWeight",
                          "number",
                        ],
                      },
                      { type: "string" },
                    ],
                  },
                },
              },
              batch: {
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

const makeFigmaOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  state: "synced",
  declaredAt: "2026-10-19T09:00:00.000Z",
  author: { kind: "member", userId: "3e8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", name: "Ada Lovelace" },
  clientId: "client-oauth-1",
  ...overrides,
});

describe("un token lu porte son état Figma, s'il a été comparé (ADR 0024 §1, ADR 0023)", () => {
  it("décode l'état Figma, sa date, son auteur et son client OAuth", () => {
    const token = makeTokenOutput({ figma: makeFigmaOutput() });

    expect(TokenOutput.parse(token)).toEqual(token);
  });

  it("un token jamais comparé n'a pas d'état Figma", () => {
    expect(TokenOutput.parse(makeTokenOutput())).not.toHaveProperty("figma");
  });

  it.each([["state"], ["declaredAt"], ["author"], ["clientId"]])(
    "refuse un état Figma sans %s",
    (field) => {
      expect(
        TokenOutput.safeParse(makeTokenOutput({ figma: makeFigmaOutput({ [field]: undefined }) }))
          .success,
      ).toBe(false);
    },
  );

  it("accepte un état Figma et une forme d'auteur ajoutés plus tard par le serveur", () => {
    const token = makeTokenOutput({
      figma: makeFigmaOutput({ state: "renamed_in_figma", author: { kind: "deleted_member" } }),
    });

    expect(TokenOutput.parse(token)).toEqual(token);
  });

  it("annonce à l'IA les états Figma connus", () => {
    expect(z.toJSONSchema(TokenOutput)).toMatchObject({
      properties: {
        figma: {
          properties: {
            state: {
              anyOf: [
                { enum: ["synced", "missing_in_figma", "duplicate_in_figma", "diverged"] },
                { type: "string" },
              ],
            },
            figmaVariables: { type: "array", items: { type: "string" } },
            author: { anyOf: [{ properties: { kind: { const: "member" } } }, {}] },
          },
        },
      },
    });
  });
});

const makeDeclared = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  name: "couleur.fond",
  state: "synced",
  declaredAt: "2026-10-19T09:00:00.000Z",
  ...overrides,
});

describe("la déclaration rend l'état Figma déclaré de chaque token (ADR 0023)", () => {
  it("décode les états déclarés, et accepte un état ajouté plus tard", () => {
    const declared = { states: [makeDeclared(), makeDeclared({ state: "renamed_in_figma" })] };

    expect(DeclaredFigmaStatesOutput.parse(declared)).toEqual(declared);
  });

  it.each([["name"], ["state"], ["declaredAt"]])("refuse un état déclaré sans %s", (field) => {
    expect(
      DeclaredFigmaStatesOutput.safeParse({ states: [makeDeclared({ [field]: undefined })] })
        .success,
    ).toBe(false);
  });
});

describe("un doublon dans Figma se lit avec ses variables Figma", () => {
  it("décode les variables Figma d'un doublon, à la lecture comme à la déclaration", () => {
    const figmaVariables = ["Couleurs/Fond", "Legacy/Fond"];
    const token = makeTokenOutput({
      figma: makeFigmaOutput({ state: "duplicate_in_figma", figmaVariables }),
    });
    const declared = {
      states: [makeDeclared({ state: "duplicate_in_figma", figmaVariables })],
    };

    expect(TokenOutput.parse(token)).toEqual(token);
    expect(DeclaredFigmaStatesOutput.parse(declared)).toEqual(declared);
  });

  it.each([[[1, 2]], ["Couleurs/Fond"]])("refuse des variables Figma %j", (figmaVariables) => {
    expect(
      TokenOutput.safeParse(makeTokenOutput({ figma: makeFigmaOutput({ figmaVariables }) }))
        .success,
    ).toBe(false);
    expect(
      DeclaredFigmaStatesOutput.safeParse({ states: [makeDeclared({ figmaVariables })] }).success,
    ).toBe(false);
  });
});

describe("la déclaration d'un token divergent rend la proposition née de la valeur Figma (ADR 0024 §4)", () => {
  const PROPOSAL = {
    id: "4f8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
    batch: { id: "5a8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", state: "open" },
  };

  it.each([[PROPOSAL], [null]])("décode la proposition %j d'un token divergent", (proposal) => {
    const declared = { states: [makeDeclared({ state: "diverged", proposal })] };

    expect(DeclaredFigmaStatesOutput.parse(declared)).toEqual(declared);
  });

  it.each([["id"], ["batch"]])("refuse une proposition sans %s", (field) => {
    expect(
      DeclaredFigmaStatesOutput.safeParse({
        states: [
          makeDeclared({ state: "diverged", proposal: { ...PROPOSAL, [field]: undefined } }),
        ],
      }).success,
    ).toBe(false);
  });

  it("annonce à l'IA l'état divergent et les états de lot connus", () => {
    expect(z.toJSONSchema(DeclaredFigmaStatesOutput)).toMatchObject({
      properties: {
        states: {
          items: {
            properties: {
              state: {
                anyOf: [
                  { enum: ["synced", "missing_in_figma", "duplicate_in_figma", "diverged"] },
                  { type: "string" },
                ],
              },
              proposal: {
                anyOf: [
                  {
                    properties: {
                      batch: {
                        properties: {
                          state: { anyOf: [{ enum: ["open", "closed"] }, { type: "string" }] },
                        },
                      },
                    },
                  },
                  { type: "null" },
                ],
              },
            },
          },
        },
      },
    });
  });
});
