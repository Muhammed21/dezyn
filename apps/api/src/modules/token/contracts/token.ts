import { z } from "zod";

import { openEnum, Uuid } from "@repo/contracts";

export const TokenOutput = z.looseObject({
  id: Uuid,
  name: z.string(),
  $type: openEnum(["color", "dimension", "typography", "shadow"]),
  $value: z.unknown(),
  modes: z.record(z.string(), z.unknown()).optional(),
  $description: z.string().optional(),
  status: openEnum(["validated"]),
});
