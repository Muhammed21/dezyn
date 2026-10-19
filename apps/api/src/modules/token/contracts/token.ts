import { z } from "zod";

import { openEnum, Uuid } from "@repo/contracts";

const DefinitionOutput = z.looseObject({
  name: z.string(),
  $type: openEnum(["color", "dimension", "typography", "shadow"]),
  $value: z.unknown().optional(),
  modes: z.record(z.string(), z.unknown()).optional(),
  $description: z.string().optional(),
});

export const TokenOutput = DefinitionOutput.extend({
  id: Uuid,
  status: openEnum(["validated"]),
});

const ProposalOutput = z.looseObject({
  id: Uuid,
  name: z.string(),
  kind: openEnum(["create", "update"]),
  status: openEnum(["proposed"]),
  batch: z.looseObject({ id: Uuid, state: openEnum(["open", "closed"]) }),
  token: DefinitionOutput,
});

export const TokensOutput = z.looseObject({
  modes: z.array(z.string()),
  tokens: z.array(TokenOutput),
  proposals: z.array(ProposalOutput).optional(),
});
