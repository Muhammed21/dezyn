import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const CreateProjectInput = z.object({ name: z.string().trim().min(1).max(100) });

export const CreatedProjectOutput = z.looseObject({
  id: Uuid,
  spaceId: Uuid,
  name: z.string(),
  createdAt: z.iso.datetime(),
});
