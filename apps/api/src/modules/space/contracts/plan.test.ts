import { describe, expect, it } from "vitest";

import { planRequired } from "./plan.ts";

describe("le refus plan-required dit le plan requis, et la limite quand il y en a une", () => {
  it("un refus sans limite ne porte que le plan requis", () => {
    expect(planRequired({ code: "plan_required", requiredPlan: "team" })).toStrictEqual({
      type: "https://dezyn.app/problems/plan-required",
      title: "Plan Team requis",
      status: 403,
      extensions: { requiredPlan: "team" },
    });
  });

  it("un refus de limite porte aussi la limite", () => {
    expect(planRequired({ code: "plan_required", requiredPlan: "team", limit: 3 })).toMatchObject({
      extensions: { requiredPlan: "team", limit: 3 },
    });
  });
});
