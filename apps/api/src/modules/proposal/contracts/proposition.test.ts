import { describe, expect, it } from "vitest";
import { z } from "zod";

import { WrittenTokensOutput } from "./proposition.ts";

const makeWrittenTokens = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  lot: { id: "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", state: "open" },
  propositions: [
    {
      id: "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
      name: "couleur.bleu.500",
      kind: "create",
      status: "proposed",
    },
  ],
  unchanged: [],
  replaced: [],
  ...overrides,
});

describe("le contrat de sortie d'une écriture de l'IA reste ouvert (ADR 0023)", () => {
  it("décode le lot et les propositions", () => {
    const written = makeWrittenTokens();

    expect(WrittenTokensOutput.parse(written)).toEqual(written);
  });

  it("décode une écriture qui n'a rien proposé, sans lot", () => {
    const written = makeWrittenTokens({
      lot: null,
      propositions: [],
      unchanged: ["couleur.bleu.500"],
    });

    expect(WrittenTokensOutput.parse(written)).toEqual(written);
  });

  it("décode les propositions remplacées, avec leur lot", () => {
    const written = makeWrittenTokens({
      replaced: [
        {
          id: "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
          name: "couleur.bleu.500",
          lotId: "3e8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
        },
      ],
    });

    expect(WrittenTokensOutput.parse(written)).toEqual(written);
  });

  it("refuse une proposition remplacée sans lot", () => {
    const written = makeWrittenTokens({
      replaced: [{ id: "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", name: "couleur.bleu.500" }],
    });

    expect(WrittenTokensOutput.safeParse(written).success).toBe(false);
  });

  it.each([["lot"], ["propositions"], ["unchanged"], ["replaced"]])(
    "refuse une écriture sans %s",
    (field) => {
      expect(WrittenTokensOutput.safeParse(makeWrittenTokens({ [field]: undefined })).success).toBe(
        false,
      );
    },
  );

  it("accepte un état de lot, une nature et un statut ajoutés plus tard par le serveur", () => {
    const written = makeWrittenTokens({
      lot: { id: "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", state: "closed", intention: "Import" },
      propositions: [
        {
          id: "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
          name: "couleur.bleu.500",
          kind: "delete",
          status: "replaced",
        },
      ],
    });

    expect(WrittenTokensOutput.parse(written)).toEqual(written);
  });

  it("annonce à l'IA les états, natures et statuts connus", () => {
    expect(z.toJSONSchema(WrittenTokensOutput)).toMatchObject({
      properties: {
        lot: {
          anyOf: [
            { properties: { state: { anyOf: [{ enum: ["open"] }, { type: "string" }] } } },
            { type: "null" },
          ],
        },
        propositions: {
          items: {
            properties: {
              kind: { anyOf: [{ enum: ["create", "update"] }, { type: "string" }] },
              status: { anyOf: [{ enum: ["proposed"] }, { type: "string" }] },
            },
          },
        },
      },
    });
  });
});
