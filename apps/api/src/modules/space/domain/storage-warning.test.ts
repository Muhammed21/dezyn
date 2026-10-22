import { describe, expect, it } from "vitest";

import type { Plan } from "./space.ts";
import { type ProjectStorage, storageWarningOf } from "./storage-warning.ts";

const makeProjectStorage = (overrides: Partial<ProjectStorage> = {}): ProjectStorage => ({
  name: "Site vitrine",
  storedBytes: 450_000_000,
  ...overrides,
});

const warningOf = ({
  plan = "free",
  projects = [makeProjectStorage()],
}: {
  readonly plan?: Plan;
  readonly projects?: readonly ProjectStorage[];
} = {}) => storageWarningOf({ spaceName: "Studio Ada", plan, projects });

const textOf = (options: Parameters<typeof warningOf>[0]) => warningOf(options)?.text ?? "";

describe("l'alerte de stockage dit quel projet sera purgé et comment l'éviter (ADR 0032 §5)", () => {
  it("un espace sous 80 % n'a pas d'alerte", () => {
    expect(warningOf({ projects: [makeProjectStorage({ storedBytes: 399_999_999 })] })).toBe(
      undefined,
    );
  });

  it("un espace sans projet n'a pas d'alerte", () => {
    expect(warningOf({ projects: [] })).toBeUndefined();
  });

  it("le sujet nomme l'espace", () => {
    expect(warningOf()?.subject).toBe(
      "L'espace « Studio Ada » atteint 80 % de son stockage sur dezyn",
    );
  });

  it("le texte donne le stockage cumulé des projets et la limite", () => {
    const projects = [
      makeProjectStorage({ name: "Site vitrine", storedBytes: 300_000_000 }),
      makeProjectStorage({ name: "Application mobile", storedBytes: 150_000_000 }),
    ];

    expect(textOf({ projects })).toContain("L'espace « Studio Ada » utilise 450 Mo sur 500 Mo.");
  });

  it("le texte nomme le projet qui consomme le plus", () => {
    const projects = [
      makeProjectStorage({ name: "Application mobile", storedBytes: 150_000_000 }),
      makeProjectStorage({ name: "Site vitrine", storedBytes: 300_000_000 }),
      makeProjectStorage({ name: "Blog", storedBytes: 0 }),
    ];

    expect(textOf({ projects })).toContain(
      "Le projet « Site vitrine » est celui qui consomme le plus.",
    );
  });

  it("à égalité, le projet nommé est le premier par ordre alphabétique", () => {
    const projects = [
      makeProjectStorage({ name: "Site vitrine", storedBytes: 225_000_000 }),
      makeProjectStorage({ name: "Application mobile", storedBytes: 225_000_000 }),
    ];

    expect(textOf({ projects })).toContain("Le projet « Application mobile »");
  });

  it("le texte dit ce qui se passe à 100 %", () => {
    expect(textOf({})).toContain(
      "À 100 %, dezyn purge les plus anciennes images de snapshots puis l'historique, en commençant par ce projet. Le MCP reste disponible.",
    );
  });

  it("en Free, le texte mentionne les 20 Go du plan Team", () => {
    expect(textOf({ plan: "free" })).toContain("Le plan Team offre 20 Go de stockage.");
  });

  it("en Team, le texte ne parle pas du plan Team", () => {
    const projects = [makeProjectStorage({ storedBytes: 16_000_000_000 })];

    expect(textOf({ plan: "team", projects })).not.toContain("plan Team");
  });

  it("en Team, le texte tient en trois paragraphes", () => {
    const projects = [makeProjectStorage({ storedBytes: 16_000_000_000 })];

    expect(textOf({ plan: "team", projects })).toBe(
      [
        "L'espace « Studio Ada » utilise 16 Go sur 20 Go.",
        "Le projet « Site vitrine » est celui qui consomme le plus.",
        "À 100 %, dezyn purge les plus anciennes images de snapshots puis l'historique, en commençant par ce projet. Le MCP reste disponible.",
      ].join("\n\n"),
    );
  });

  it.each([
    [999_999_999, "999 Mo sur 500 Mo"],
    [1_000_000_000, "1 Go sur 500 Mo"],
    [1_099_999_999, "1 Go sur 500 Mo"],
    [1_250_000_000, "1,2 Go sur 500 Mo"],
  ])("en Free, %i octets s'écrivent « %s »", (storedBytes, usage) => {
    expect(textOf({ projects: [makeProjectStorage({ storedBytes })] })).toContain(usage);
  });

  it.each([
    [16_250_000_000, "16,2 Go sur 20 Go"],
    [20_000_000_000, "20 Go sur 20 Go"],
  ])("en Team, %i octets s'écrivent « %s »", (storedBytes, usage) => {
    expect(textOf({ plan: "team", projects: [makeProjectStorage({ storedBytes })] })).toContain(
      usage,
    );
  });
});
