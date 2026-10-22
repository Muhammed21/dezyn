import { z } from "zod";

import { openEnum, Uuid } from "@repo/contracts";

import { PLANS, ROLES } from "../domain/space.ts";

export const MySpacesOutput = z.looseObject({
  spaces: z.array(
    z.looseObject({
      id: Uuid,
      name: z.string(),
      plan: openEnum(PLANS),
      role: openEnum(ROLES),
    }),
  ),
});
