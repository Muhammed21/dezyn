import { describe, expect, it } from "vitest";

import { ProjectsOutput } from "./projects.ts";

const makeProject = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "Site vitrine",
  createdAt: "2026-10-19T09:00:00.000Z",
  ...overrides,
});

describe("sortie de la liste des projets d'un espace", () => {
  it("garde une clé ajoutée plus tard par le serveur (ADR 0023 §1)", () => {
    const later = { projects: [makeProject({ tokenCount: 12 })], nextCursor: null };

    expect(ProjectsOutput.parse(later)).toEqual(later);
  });

  it("refuse un identifiant de projet qui n'est pas un UUID", () => {
    expect(ProjectsOutput.safeParse({ projects: [makeProject({ id: "projet-1" })] }).success).toBe(
      false,
    );
  });

  it("refuse une date de création qui n'est pas une date ISO", () => {
    expect(
      ProjectsOutput.safeParse({ projects: [makeProject({ createdAt: "hier" })] }).success,
    ).toBe(false);
  });
});
