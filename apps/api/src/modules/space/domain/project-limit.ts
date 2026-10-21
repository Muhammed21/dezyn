import type { PlanRequired } from "./invitation.ts";
import type { Plan } from "./space.ts";

export const FREE_PROJECT_LIMIT = 3;

export type ProjectLimitReached = PlanRequired & { readonly limit: number };

export const projectLimitRefusal = ({
  plan,
  projects,
}: {
  readonly plan: Plan;
  readonly projects: number;
}): ProjectLimitReached | undefined =>
  plan === "free" && projects >= FREE_PROJECT_LIMIT
    ? { code: "plan_required", requiredPlan: "team", limit: FREE_PROJECT_LIMIT }
    : undefined;
