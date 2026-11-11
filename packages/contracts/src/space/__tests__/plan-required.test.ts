import { describe, expect, it } from "vitest";
import { z } from "zod";

import { PlanRequiredProblem } from "../../index.ts";

const makePlanRequired = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  type: "https://dezyn.dev/problems/plan-required",
  title: "Plan Team requis",
  status: 403,
  requiredPlan: "team",
  limit: 3,
  ...overrides,
});

describe("refus « plan requis »", () => {
  it("lit le plan requis et la limite atteinte", () => {
    expect(PlanRequiredProblem.parse(makePlanRequired())).toMatchObject({
      requiredPlan: "team",
      limit: 3,
    });
  });

  it("accepte un refus sans limite, comme celui d'une invitation", () => {
    const { limit: _limit, ...withoutLimit } = makePlanRequired();

    expect(PlanRequiredProblem.safeParse(withoutLimit).success).toBe(true);
  });

  it("garde un plan et une clé ajoutés plus tard par le serveur (ADR 0023)", () => {
    const later = makePlanRequired({ requiredPlan: "enterprise", instance: "/v1/spaces" });

    expect(PlanRequiredProblem.parse(later)).toEqual(later);
  });

  it.each([
    ["d'un autre type", { type: "about:blank" }],
    ["d'un autre statut", { status: 400 }],
    ["sans plan requis", { requiredPlan: undefined }],
    ["avec une limite qui n'est pas un nombre", { limit: "3" }],
  ])("refuse un problème %s", (_case, overrides) => {
    expect(PlanRequiredProblem.safeParse(makePlanRequired(overrides)).success).toBe(false);
  });

  it("annonce les plans connus", () => {
    expect(z.toJSONSchema(PlanRequiredProblem)).toMatchObject({
      properties: { requiredPlan: { anyOf: [{ enum: ["free", "team"] }, { type: "string" }] } },
    });
  });
});
