import type { Context } from "hono";

import type { AuthenticatedEnv } from "#platform/access-token.ts";
import { problemResponse } from "#platform/problem.ts";

import { planRequired } from "../contracts/plan.ts";
import type { PlanRequired } from "../domain/invitation.ts";

export const planRequiredProblem = (c: Context<AuthenticatedEnv>, refusal: PlanRequired) =>
  problemResponse(c, planRequired(refusal));
