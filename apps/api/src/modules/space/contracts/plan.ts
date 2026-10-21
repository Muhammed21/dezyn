import type { PlanRequired } from "../domain/invitation.ts";

export type { Plan } from "../domain/space.ts";
export { type ProjectLimitReached, projectLimitRefusal } from "../domain/project-limit.ts";

export type PlanRequiredProblem = {
  readonly type: "https://dezyn.app/problems/plan-required";
  readonly title: string;
  readonly status: 403;
  readonly extensions: Readonly<Record<string, string | number>>;
};

export const planRequired = ({
  requiredPlan,
  limit,
}: PlanRequired & { readonly limit?: number }): PlanRequiredProblem => ({
  type: "https://dezyn.app/problems/plan-required",
  title: "Plan Team requis",
  status: 403,
  extensions: limit === undefined ? { requiredPlan } : { requiredPlan, limit },
});
