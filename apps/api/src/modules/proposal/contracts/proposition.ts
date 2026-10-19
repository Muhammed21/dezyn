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
  replaced: z.array(z.looseObject({ id: Uuid, name: z.string(), lotId: Uuid })),
});

const LotOutput = z.looseObject({
  id: Uuid,
  state: openEnum(["open", "closed"]),
  intention: z.string().nullable(),
});

export const OpenedBatchOutput = z.looseObject({
  lot: LotOutput,
  closed: z.looseObject({ id: Uuid }).nullable(),
});

export const ClosedBatchOutput = z.looseObject({ lot: LotOutput.nullable() });
