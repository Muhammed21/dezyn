import { describe, expect, it } from "vitest";

import type { Membership } from "../domain/can.ts";
import { inMemoryMembershipReader } from "./membership-reader.ts";
import { readSpace } from "./read-space.ts";

const SPACE = {
  id: "6d1f0c2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f",
  name: "Studio Ada",
  plan: "team",
} as const;
const ADA = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const GRACE = "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e";

const makeMembership = (overrides: Partial<Membership> = {}): Membership => ({
  spaceId: SPACE.id,
  userId: ADA,
  role: "editor",
  ...overrides,
});

const readWith = (memberships: readonly Membership[]) =>
  readSpace({
    memberships: inMemoryMembershipReader(memberships),
    spaces: { find: async () => SPACE },
  });

describe("lire un espace", () => {
  it("rend l'espace et le rôle du membre qui le lit", async () => {
    const read = readWith([makeMembership({ role: "editor" })]);

    expect(await read({ spaceId: SPACE.id, userId: ADA })).toEqual({
      ok: true,
      value: { ...SPACE, role: "editor" },
    });
  });

  it("ne trouve pas l'espace pour un utilisateur qui n'en est pas membre", async () => {
    const read = readWith([makeMembership({ userId: ADA })]);

    expect(await read({ spaceId: SPACE.id, userId: GRACE })).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("ne trouve pas l'espace pour un membre d'un autre espace", async () => {
    const read = readWith([makeMembership({ spaceId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" })]);

    expect(await read({ spaceId: SPACE.id, userId: ADA })).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
