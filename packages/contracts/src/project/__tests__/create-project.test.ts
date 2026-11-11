import { describe, expect, it } from "vitest";

import { checkOutputSchema, CreatedProjectOutput, CreateProjectInput } from "../../index.ts";

const makeCreatedProject = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "0b6f3c2a-8d4e-4f1a-9c7b-5e2d1a0f9b8c",
  spaceId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "Site vitrine",
  createdAt: "2026-11-11T18:00:00.000Z",
  ...overrides,
});

describe("entrée de la création d'un projet", () => {
  it("rogne le nom", () => {
    expect(CreateProjectInput.parse({ name: "  Site vitrine  " })).toEqual({
      name: "Site vitrine",
    });
  });

  it("accepte un nom de 100 caractères", () => {
    expect(CreateProjectInput.safeParse({ name: "a".repeat(100) }).success).toBe(true);
  });

  it.each([
    ["vide", ""],
    ["fait d'espaces", "   "],
    ["de 101 caractères", "a".repeat(101)],
  ])("refuse un nom %s", (_case, name) => {
    expect(CreateProjectInput.safeParse({ name }).success).toBe(false);
  });
});

describe("sortie de la création d'un projet", () => {
  it("garde une clé ajoutée plus tard par le serveur (ADR 0023 §1)", () => {
    const later = makeCreatedProject({ historyPurgedAt: null });

    expect(CreatedProjectOutput.parse(later)).toEqual(later);
  });

  it.each([
    ["un identifiant de projet", { id: "projet-1" }],
    ["un identifiant d'espace", { spaceId: "espace-1" }],
  ])("refuse %s qui n'est pas un UUID", (_case, overrides) => {
    expect(CreatedProjectOutput.safeParse(makeCreatedProject(overrides)).success).toBe(false);
  });

  it("refuse une date de création qui n'est pas une date ISO", () => {
    expect(CreatedProjectOutput.safeParse(makeCreatedProject({ createdAt: "hier" })).success).toBe(
      false,
    );
  });

  it("respecte les conventions de sortie (ADR 0023 §4)", () => {
    expect(checkOutputSchema("CreatedProjectOutput", CreatedProjectOutput)).toEqual([]);
  });
});
