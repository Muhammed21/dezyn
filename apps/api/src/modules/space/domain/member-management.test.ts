import { describe, expect, it } from "vitest";

import { removalRefusal, roleChangeRefusal } from "./member-management.ts";

describe("un changement de rôle garde un propriétaire à l'espace (ADR 0017 §4)", () => {
  it("un éditeur devient propriétaire", () => {
    expect(roleChangeRefusal({ current: "editor", next: "owner", openOwners: 1 })).toBeUndefined();
  });

  it("un propriétaire devient éditeur s'il reste un autre propriétaire", () => {
    expect(roleChangeRefusal({ current: "owner", next: "editor", openOwners: 2 })).toBeUndefined();
  });

  it("le dernier propriétaire ne devient pas éditeur", () => {
    expect(roleChangeRefusal({ current: "owner", next: "editor", openOwners: 1 })).toBe(
      "last_owner",
    );
  });

  it("le dernier propriétaire reste propriétaire", () => {
    expect(roleChangeRefusal({ current: "owner", next: "owner", openOwners: 1 })).toBeUndefined();
  });
});

describe("un propriétaire retire un autre membre, jamais lui-même (ADR 0031)", () => {
  it("retire un autre membre", () => {
    expect(removalRefusal({ actorId: "ada", targetId: "grace" })).toBeUndefined();
  });

  it("ne se retire pas lui-même : il part", () => {
    expect(removalRefusal({ actorId: "ada", targetId: "ada" })).toBe("self_removal");
  });
});
