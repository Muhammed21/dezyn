import type { Context } from "hono";

import type { AuthenticatedEnv } from "#platform/access-token.ts";
import { problemResponse } from "#platform/problem.ts";

import type { PlanRequired } from "../domain/invitation.ts";

export const planRequiredProblem = (c: Context<AuthenticatedEnv>, refusal: PlanRequired) =>
  problemResponse(c, {
    type: "https://dezyn.app/problems/plan-required",
    title: "Plan Team requis",
    status: 403,
    extensions: { requiredPlan: refusal.requiredPlan },
  });
