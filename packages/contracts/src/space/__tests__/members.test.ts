import { describe, expect, it } from "vitest";

import {
  ChangedRoleOutput,
  checkOutputSchema,
  LastOwnerProblem,
  SelfRemovalProblem,
  SentInvitationOutput,
} from "../../index.ts";

const INVITATION_ID = "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const MEMBER_ID = "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const makeSentInvitation = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: INVITATION_ID,
  email: "grace@dezyn.dev",
  expiresAt: "2026-11-20T19:00:00.000Z",
  ...overrides,
});

const makeChangedRole = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  userId: MEMBER_ID,
  role: "editor",
  ...overrides,
});

const makeLastOwner = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  type: "https://dezyn.dev/problems/last-owner",
  title: "Dernier propriétaire de l'espace",
  status: 409,
  ...overrides,
});

const makeSelfRemoval = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  type: "https://dezyn.dev/problems/self-removal",
  title: "Un membre quitte l'espace par son départ",
  status: 409,
  ...overrides,
});

describe("invitation envoyée (ADR 0011)", () => {
  it("lit l'invitation, son email et sa date d'expiration", () => {
    expect(SentInvitationOutput.parse(makeSentInvitation())).toEqual(makeSentInvitation());
  });

  it("garde une clé ajoutée plus tard par le serveur (ADR 0023)", () => {
    const later = makeSentInvitation({ role: "editor" });

    expect(SentInvitationOutput.parse(later)).toEqual(later);
  });

  it.each([
    ["un identifiant qui n'est pas un UUID", { id: "invitation-1" }],
    ["une expiration qui n'est pas une date ISO", { expiresAt: "dans 7 jours" }],
    ["sans email", { email: undefined }],
  ])("refuse %s", (_case, overrides) => {
    expect(SentInvitationOutput.safeParse(makeSentInvitation(overrides)).success).toBe(false);
  });
});

describe("rôle changé (ADR 0017 §1)", () => {
  it.each(["owner", "editor"])("lit le rôle %s du membre", (role) => {
    expect(ChangedRoleOutput.parse(makeChangedRole({ role }))).toEqual(makeChangedRole({ role }));
  });

  it("garde un rôle ajouté plus tard par le serveur (ADR 0023 §2)", () => {
    expect(ChangedRoleOutput.parse(makeChangedRole({ role: "viewer" })).role).toBe("viewer");
  });

  it.each([
    ["un membre qui n'est pas un UUID", { userId: "grace" }],
    ["sans rôle", { role: undefined }],
  ])("refuse %s", (_case, overrides) => {
    expect(ChangedRoleOutput.safeParse(makeChangedRole(overrides)).success).toBe(false);
  });
});

describe("refus « dernier propriétaire de l'espace » (ADR 0017 §4)", () => {
  it("garde une clé ajoutée plus tard par le serveur (ADR 0023)", () => {
    const later = makeLastOwner({ instance: "/v1/spaces" });

    expect(LastOwnerProblem.parse(later)).toEqual(later);
  });

  it.each([
    ["d'un autre type", { type: "about:blank" }],
    ["du type d'un retrait de soi-même", { type: "https://dezyn.dev/problems/self-removal" }],
    ["d'un autre statut", { status: 403 }],
    ["sans titre", { title: undefined }],
  ])("refuse un problème %s", (_case, overrides) => {
    expect(LastOwnerProblem.safeParse(makeLastOwner(overrides)).success).toBe(false);
  });
});

describe("refus « un membre quitte l'espace par son départ » (ADR 0031)", () => {
  it("garde une clé ajoutée plus tard par le serveur (ADR 0023)", () => {
    const later = makeSelfRemoval({ instance: "/v1/spaces" });

    expect(SelfRemovalProblem.parse(later)).toEqual(later);
  });

  it.each([
    ["d'un autre type", { type: "about:blank" }],
    ["du type d'un dernier propriétaire", { type: "https://dezyn.dev/problems/last-owner" }],
    ["d'un autre statut", { status: 403 }],
    ["sans titre", { title: undefined }],
  ])("refuse un problème %s", (_case, overrides) => {
    expect(SelfRemovalProblem.safeParse(makeSelfRemoval(overrides)).success).toBe(false);
  });
});

describe("conventions de sortie des membres et des invitations (ADR 0023 §4)", () => {
  it.each([
    ["SentInvitationOutput", SentInvitationOutput],
    ["ChangedRoleOutput", ChangedRoleOutput],
    ["LastOwnerProblem", LastOwnerProblem],
    ["SelfRemovalProblem", SelfRemovalProblem],
  ])("%s les respecte", (name, schema) => {
    expect(checkOutputSchema(name, schema)).toEqual([]);
  });
});
