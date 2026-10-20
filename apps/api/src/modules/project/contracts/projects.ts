import { z } from "zod";

import { Uuid } from "@repo/contracts";

export const ProjectsOutput = z.looseObject({
  projects: z.array(
    z.looseObject({
      id: Uuid,
      name: z.string(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
