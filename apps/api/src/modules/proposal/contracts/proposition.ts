import { z } from "zod";

import { openEnum, Uuid } from "@repo/contracts";

export const WrittenTokensOutput = z.looseObject({
  lot: z.looseObject({ id: Uuid, state: openEnum(["open"]) }).nullable(),
  propositions: z.array(
    z.looseObject({
      id: Uuid,
      name: z.string(),
      kind: openEnum(["create", "update"]),
      status: openEnum(["proposed"]),
    }),
  ),
  unchanged: z.array(z.string()),
});
