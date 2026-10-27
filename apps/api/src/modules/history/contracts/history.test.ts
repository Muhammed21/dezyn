import { describe, expect, it } from "vitest";
import { z } from "zod";

import { HistoryOutput } from "./history.ts";

const makeEntry = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  action: "project.created",
  spaceId: "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  projectId: "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  author: {
    kind: "member",
    userId: "3e8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
    name: "Ada Lovelace",
    membership: "active",
  },
  clientId: null,
  before: null,
  after: { name: "Site vitrine" },
  occurredAt: "2026-10-18T12:00:00.000Z",
  correlationId: "creation-du-projet-1",
  ...overrides,
});

describe("le contrat de sortie de l'historique reste ouvert (ADR 0023)", () => {
  it("décode une page d'entrées et le curseur de la suivante", () => {
    const page = { entries: [makeEntry()], nextCursor: "eyJpZCI6IjEifQ" };

    expect(HistoryOutput.parse(page)).toEqual(page);
  });

  it("refuse une page sans curseur suivant", () => {
    expect(HistoryOutput.safeParse({ entries: [makeEntry()] }).success).toBe(false);
  });

  it("accepte une action ajoutée plus tard par le serveur", () => {
    expect(
      HistoryOutput.safeParse({ nextCursor: null, entries: [makeEntry({ action: "token.added" })] })
        .success,
    ).toBe(true);
  });

  it("accepte une forme d'auteur ajoutée plus tard, sans perdre ses champs", () => {
    const author = { kind: "deleted_member", number: 3 };

    expect(
      HistoryOutput.parse({ nextCursor: null, entries: [makeEntry({ author })] }).entries[0]
        ?.author,
    ).toEqual(author);
  });

  it("refuse un auteur sans forme", () => {
    expect(
      HistoryOutput.safeParse({
        nextCursor: null,
        entries: [makeEntry({ author: { name: "Ada Lovelace" } })],
      }).success,
    ).toBe(false);
  });

  it("dit si l'auteur a quitté l'espace", () => {
    const author = { ...makeEntry().author, membership: "left" };

    expect(
      HistoryOutput.parse({ nextCursor: null, entries: [makeEntry({ author })] }).entries[0]
        ?.author,
    ).toEqual(author);
  });

  it("accepte une appartenance ajoutée plus tard par le serveur", () => {
    const author = { ...makeEntry().author, membership: "suspended" };

    expect(
      HistoryOutput.safeParse({ nextCursor: null, entries: [makeEntry({ author })] }).success,
    ).toBe(true);
  });

  it("annonce à l'IA les actions et les formes d'auteur connues", () => {
    expect(z.toJSONSchema(HistoryOutput)).toMatchObject({
      properties: {
        entries: {
          items: {
            properties: {
              action: {
                anyOf: [
                  {
                    enum: [
                      "project.created",
                      "token.created",
                      "proposal.validated",
                      "proposal.rejected",
                      "mcp.read_history",
                      "mcp.read_tokens",
                      "mcp.write_tokens",
                      "mcp.open_proposal_batch",
                      "mcp.close_proposal_batch",
                    ],
                  },
                  { type: "string" },
                ],
              },
              author: {
                anyOf: [
                  {
                    properties: {
                      kind: { const: "member" },
                      membership: { anyOf: [{ enum: ["active", "left"] }, { type: "string" }] },
                    },
                  },
                  {},
                ],
              },
            },
          },
        },
      },
    });
  });
});
