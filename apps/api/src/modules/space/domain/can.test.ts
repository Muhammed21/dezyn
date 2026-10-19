import { describe, expect, it } from "vitest";

import { type Action, can, type Membership } from "./can.ts";

const makeMembership = (overrides: Partial<Membership> = {}): Membership => ({
  spaceId: "6d1f0c2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f",
  userId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  role: "editor",
  ...overrides,
});

const OWNER = makeMembership({ role: "owner" });
const EDITOR = makeMembership({ role: "editor" });

describe("can : ce que peut faire un membre dans un espace (ADR 0017 §3)", () => {
  it.each<[string, Action, boolean, Membership | undefined]>([
    ["un propriétaire", "space.read", true, OWNER],
    ["un propriétaire", "project.create", true, OWNER],
    ["un propriétaire", "member.invite", true, OWNER],
    ["un propriétaire", "member.leave", true, OWNER],
    ["un propriétaire", "token.create", true, OWNER],
    ["un propriétaire", "proposal.review", true, OWNER],
    ["un éditeur", "space.read", true, EDITOR],
    ["un éditeur", "project.create", false, EDITOR],
    ["un éditeur", "member.invite", false, EDITOR],
    ["un éditeur", "member.leave", true, EDITOR],
    ["un éditeur", "token.create", true, EDITOR],
    ["un éditeur", "proposal.review", true, EDITOR],
    ["un non-membre", "space.read", false, undefined],
    ["un non-membre", "project.create", false, undefined],
    ["un non-membre", "member.invite", false, undefined],
    ["un non-membre", "member.leave", false, undefined],
    ["un non-membre", "token.create", false, undefined],
    ["un non-membre", "proposal.review", false, undefined],
  ])("%s, pour %s : %s", (_who, action, allowed, membership) => {
    expect(can({ membership, action })).toBe(allowed);
  });
});
