import { describe, expect, it } from "vitest";

import { departureRefusal } from "./departure.ts";

describe("un espace garde toujours un propriétaire (ADR 0011 §5)", () => {
  it("un propriétaire part s'il reste un autre propriétaire", () => {
    expect(departureRefusal({ role: "owner", openOwners: 2 })).toBeUndefined();
  });

  it("le seul propriétaire ne part pas", () => {
    expect(departureRefusal({ role: "owner", openOwners: 1 })).toBe("last_owner");
  });

  it("un éditeur part, même avec un seul propriétaire", () => {
    expect(departureRefusal({ role: "editor", openOwners: 1 })).toBeUndefined();
  });
});
