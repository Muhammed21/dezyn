import { z } from "zod";

import { PLANS, ROLES } from "../domain/space.ts";

const StoredPlan = z.enum(PLANS);

const StoredRole = z.enum(ROLES);

export const StoredSpace = z.object({ id: z.string(), name: z.string(), plan: StoredPlan });

export const StoredSpaceWithRole = StoredSpace.extend({ role: StoredRole });

export const StoredMembership = z.object({
  spaceId: z.string(),
  userId: z.string(),
  role: StoredRole,
});

export const StoredMember = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: StoredRole,
});
