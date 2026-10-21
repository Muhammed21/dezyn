import { describe, expect, it } from "vitest";

import { projectLimitRefusal } from "./project-limit.ts";

describe("un espace Free crée au plus 3 projets, un espace Team sans limite (ADR 0006 §1)", () => {
  it("un espace Free à 2 projets en crée un autre", () => {
    expect(projectLimitRefusal({ plan: "free", projects: 2 })).toBeUndefined();
  });

  it.each([3, 7])(
    "un espace Free à %i projets est refusé, en donnant le plan requis et la limite",
    (projects) => {
      expect(projectLimitRefusal({ plan: "free", projects })).toEqual({
        code: "plan_required",
        requiredPlan: "team",
        limit: 3,
      });
    },
  );

  it("un espace Team à 50 projets en crée un autre", () => {
    expect(projectLimitRefusal({ plan: "team", projects: 50 })).toBeUndefined();
  });
});
