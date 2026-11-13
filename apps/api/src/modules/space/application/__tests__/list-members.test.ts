import { describe, expect, it } from "vitest";

import type { Membership } from "../../domain/can.ts";
import { listMembers, type SpaceMember } from "../list-members.ts";
import { inMemoryMembershipReader } from "../membership-reader.ts";

const SPACE_ID = "6d1f0c2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
const ADA = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const GRACE = "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e";

const MEMBERS: readonly SpaceMember[] = [
  { userId: ADA, name: "Ada Lovelace", email: "ada@dezyn.test", role: "owner" },
  { userId: GRACE, name: "Grace Hopper", email: "grace@dezyn.test", role: "editor" },
];

const makeMembership = (overrides: Partial<Membership> = {}): Membership => ({
  spaceId: SPACE_ID,
  userId: GRACE,
  role: "editor",
  ...overrides,
});

const listWith = (memberships: readonly Membership[]) =>
  listMembers({
    memberships: inMemoryMembershipReader(memberships),
    members: { activeMembers: async () => MEMBERS },
  });

describe("lister les membres d'un espace", () => {
  it("rend les membres de l'espace à un éditeur", async () => {
    const list = listWith([makeMembership({ role: "editor" })]);

    expect(await list({ spaceId: SPACE_ID, userId: GRACE })).toEqual({
      ok: true,
      value: MEMBERS,
    });
  });

  it("ne trouve pas l'espace pour un utilisateur qui n'en est pas membre", async () => {
    const list = listWith([makeMembership({ userId: ADA })]);

    expect(await list({ spaceId: SPACE_ID, userId: GRACE })).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
