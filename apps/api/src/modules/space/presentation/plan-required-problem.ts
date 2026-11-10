import type { Context } from "hono";

import type { MemberEnv } from "#platform/member-identity.ts";
import { problemResponse } from "#platform/problem.ts";

import { planRequired } from "../contracts/plan.ts";
import type { PlanRequired } from "../domain/invitation.ts";

export const planRequiredProblem = (c: Context<MemberEnv>, refusal: PlanRequired) =>
  problemResponse(c, planRequired(refusal));
