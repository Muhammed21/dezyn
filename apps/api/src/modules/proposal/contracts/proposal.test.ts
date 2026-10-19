import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ClosedBatchOutput, OpenedBatchOutput, WrittenTokensOutput } from "./proposal.ts";

const makeWrittenTokens = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  batch: { id: "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", state: "open" },
  proposals: [
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
      batch: null,
      proposals: [],
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
          batchId: "3e8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
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

  it.each([["batch"], ["proposals"], ["unchanged"], ["replaced"]])(
    "refuse une écriture sans %s",
    (field) => {
      expect(WrittenTokensOutput.safeParse(makeWrittenTokens({ [field]: undefined })).success).toBe(
        false,
      );
    },
  );

  it("accepte un état de lot, une nature et un statut ajoutés plus tard par le serveur", () => {
    const written = makeWrittenTokens({
      batch: { id: "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", state: "closed", intent: "Import" },
      proposals: [
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
        batch: {
          anyOf: [
            { properties: { state: { anyOf: [{ enum: ["open"] }, { type: "string" }] } } },
            { type: "null" },
          ],
        },
        proposals: {
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

const LOT_ID = "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const makeBatchOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: LOT_ID,
  state: "open",
  intent: "Import du Figma Healthcare",
  ...overrides,
});

describe("le contrat de sortie de l'ouverture et de la fermeture d'un lot reste ouvert (ADR 0023)", () => {
  it("décode un lot ouvert et le lot qu'il a fermé", () => {
    const opened = {
      batch: makeBatchOutput(),
      closed: { id: "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b" },
    };

    expect(OpenedBatchOutput.parse(opened)).toEqual(opened);
  });

  it("décode un lot fermé sans intention, et une fermeture sans lot", () => {
    const closed = { batch: makeBatchOutput({ state: "closed", intent: null }) };

    expect(ClosedBatchOutput.parse(closed)).toEqual(closed);
    expect(ClosedBatchOutput.parse({ batch: null })).toEqual({ batch: null });
  });

  it.each([["id"], ["state"], ["intent"]])("refuse un lot sans %s", (field) => {
    expect(
      OpenedBatchOutput.safeParse({ batch: makeBatchOutput({ [field]: undefined }), closed: null })
        .success,
    ).toBe(false);
  });

  it("refuse un lot fermé implicitement sans identifiant", () => {
    expect(OpenedBatchOutput.safeParse({ batch: makeBatchOutput(), closed: {} }).success).toBe(
      false,
    );
  });

  it("annonce à l'IA les états de lot connus", () => {
    const state = { anyOf: [{ enum: ["open", "closed"] }, { type: "string" }] };

    expect(z.toJSONSchema(OpenedBatchOutput)).toMatchObject({
      properties: { batch: { properties: { state } } },
    });
    expect(z.toJSONSchema(ClosedBatchOutput)).toMatchObject({
      properties: { batch: { anyOf: [{ properties: { state } }, { type: "null" }] } },
    });
  });
});
