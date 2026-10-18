import { z } from "zod";

import { openEnum, Uuid } from "@repo/contracts";

export const MySpacesOutput = z.looseObject({
  spaces: z.array(
    z.looseObject({
      id: Uuid,
      name: z.string(),
      plan: openEnum(["free", "team"]),
      role: openEnum(["owner", "editor"]),
    }),
  ),
});
