import { z } from "zod";

const StoredPlan = z.enum(["free", "team"]);

const StoredRole = z.enum(["owner", "editor"]);

export const StoredSpace = z.object({ id: z.string(), name: z.string(), plan: StoredPlan });

export const StoredMySpace = StoredSpace.extend({ role: StoredRole });

export const StoredMembership = z.object({
  spaceId: z.string(),
  userId: z.string(),
  role: StoredRole,
});
