import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const ProjectsOutput = z.looseObject({
  projects: z.array(
    z.looseObject({
      id: Uuid,
      name: z.string(),
      createdAt: z.iso.datetime(),
      historyPurgedAt: z.iso.datetime().nullable(),
    }),
  ),
});
