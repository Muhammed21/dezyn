import { z } from "zod";

import { openEnum, Uuid } from "../conventions/schemas.ts";

export const PLANS = ["free", "team"] as const;

export const ROLES = ["owner", "editor"] as const;

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
