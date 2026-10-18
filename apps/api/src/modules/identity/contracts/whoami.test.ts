import { describe, expect, it } from "vitest";

import { WhoamiOutput } from "./whoami.ts";

const makeWhoami = (overrides: Record<string, unknown> = {}) => ({
  userId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  clientId: "HbLFEZjyyIsyDNGWaWMxRVVSWWJqoCwA",
  ...overrides,
});

describe("sortie de whoami", () => {
  it("garde une clé ajoutée plus tard par le serveur (ADR 0023 §1)", () => {
    expect(WhoamiOutput.parse(makeWhoami({ spaces: 2 }))).toEqual(makeWhoami({ spaces: 2 }));
  });

  it("refuse un identifiant d'utilisateur qui n'est pas un UUID", () => {
    expect(WhoamiOutput.safeParse(makeWhoami({ userId: "ada" })).success).toBe(false);
  });
});
