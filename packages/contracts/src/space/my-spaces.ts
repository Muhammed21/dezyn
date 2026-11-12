import { z } from "zod";

import { openEnum, Uuid } from "../conventions/schemas.ts";

export const PLANS = ["free", "team"] as const;

export const ROLES = ["owner", "editor"] as const;

export const ACTIONS = [
  "space.read",
  "project.create",
  "member.invite",
  "member.leave",
  "member.manage",
  "token.create",
  "token.declareFigmaState",
  "proposal.review",
] as const;

export const MySpaceOutput = z.looseObject({
  id: Uuid,
  name: z.string(),
  plan: openEnum(PLANS),
  role: openEnum(ROLES),
  allowedActions: z.array(openEnum(ACTIONS)),
});

export const MySpacesOutput = z.looseObject({
  spaces: z.array(MySpaceOutput),
});
