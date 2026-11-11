import { z } from "zod";

import { openEnum } from "../conventions/schemas.ts";
import { PLANS } from "./my-spaces.ts";

export const PlanRequiredProblem = z.looseObject({
  type: z.literal("https://dezyn.dev/problems/plan-required"),
  title: z.string(),
  status: z.literal(403),
  requiredPlan: openEnum(PLANS),
  limit: z.number().optional(),
});
