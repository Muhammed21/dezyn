import { z } from "zod";

import { openEnum, Uuid } from "@repo/contracts";

export const WrittenTokensOutput = z.looseObject({
  lot: z.looseObject({ id: Uuid, state: openEnum(["open"]) }),
  propositions: z.array(
    z.looseObject({
      id: Uuid,
      name: z.string(),
      kind: openEnum(["create"]),
      status: openEnum(["proposed"]),
    }),
  ),
});
