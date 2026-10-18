import { describe, expect, it } from "vitest";

import { type AcceptanceFacts, acceptanceRefusal } from "./acceptance.ts";

const EXPIRES_AT = new Date("2026-10-25T12:00:00.000Z");
const GRACE = "grace@dezyn.test";

const makeFacts = ({ now }: { readonly now: Date }): AcceptanceFacts => ({
  invitation: { email: GRACE, expiresAt: EXPIRES_AT, acceptedAt: null },
  plan: "team",
  alreadyMember: false,
  email: GRACE,
  now,
});

describe("une invitation n'est valable que jusqu'à son expiration", () => {
  it("une milliseconde avant l'expiration, elle s'accepte", () => {
    expect(
      acceptanceRefusal(makeFacts({ now: new Date(EXPIRES_AT.getTime() - 1) })),
    ).toBeUndefined();
  });

  it("à l'instant de l'expiration, elle a disparu", () => {
    expect(acceptanceRefusal(makeFacts({ now: EXPIRES_AT }))).toBe("gone");
  });

  it("après l'expiration, elle a disparu", () => {
    expect(acceptanceRefusal(makeFacts({ now: new Date(EXPIRES_AT.getTime() + 1) }))).toBe("gone");
  });
});
