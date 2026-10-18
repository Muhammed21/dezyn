import { describe, expect, it } from "vitest";

import { invitationRefusalOn } from "./invitation.ts";

describe("une invitation demande le plan Team (ADR 0011 §4)", () => {
  it("un espace Team peut inviter", () => {
    expect(invitationRefusalOn("team")).toBeUndefined();
  });

  it("un espace Free refuse, en nommant le plan requis", () => {
    expect(invitationRefusalOn("free")).toEqual({ code: "plan_required", requiredPlan: "team" });
  });
});
