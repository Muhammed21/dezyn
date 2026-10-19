import { describe, expect, it } from "vitest";

import { makeApp } from "#testing/make-app.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const correlationIdFor = async (headers: Record<string, string>) => {
  const { app } = makeApp();
  const response = await app.request("/health", { headers });
  return response.headers.get("x-correlation-id");
};

describe("identifiant de corrélation", () => {
  it("reprend un identifiant reçu valide", async () => {
    expect(await correlationIdFor({ "x-correlation-id": "ci-run_42" })).toBe("ci-run_42");
  });

  it("reprend un identifiant reçu de 64 caractères", async () => {
    const longest = "a".repeat(64);

    expect(await correlationIdFor({ "x-correlation-id": longest })).toBe(longest);
  });

  it.each([
    ["trop long", "a".repeat(65)],
    ["vide", ""],
    ["avec un caractère interdit", "ci run"],
  ])("génère un UUID quand l'identifiant reçu est %s", async (_, provided) => {
    expect(await correlationIdFor({ "x-correlation-id": provided })).toMatch(UUID);
  });

  it("génère un UUID quand aucun identifiant n'est reçu", async () => {
    expect(await correlationIdFor({})).toMatch(UUID);
  });
});
