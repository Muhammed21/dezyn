import { z } from "zod";

import { openEnum, Uuid } from "@repo/contracts";

export const TokenOutput = z.looseObject({
  id: Uuid,
  name: z.string(),
  $type: openEnum(["color"]),
  $value: z.unknown(),
  $description: z.string().optional(),
  status: openEnum(["validated"]),
});
