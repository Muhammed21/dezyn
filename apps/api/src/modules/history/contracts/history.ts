import { z } from "zod";

import { extensibleUnion, openEnum, Uuid } from "@repo/contracts";

export const HistoryAuthor = extensibleUnion("kind", [
  z.looseObject({
    kind: z.literal("member"),
    userId: Uuid,
    name: z.string(),
    membership: openEnum(["active", "left"]),
  }),
]);

export const HistoryEntryOutput = z.looseObject({
  id: Uuid,
  action: openEnum([
    "project.created",
    "token.created",
    "proposal.validated",
    "proposal.rejected",
    "mcp.read_history",
    "mcp.read_tokens",
    "mcp.write_tokens",
    "mcp.open_proposal_batch",
    "mcp.close_proposal_batch",
  ]),
  spaceId: Uuid,
  projectId: Uuid,
  author: HistoryAuthor,
  clientId: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  occurredAt: z.iso.datetime(),
  correlationId: z.string(),
});

export const HistoryOutput = z.looseObject({
  entries: z.array(HistoryEntryOutput),
  nextCursor: z.string().nullable(),
});
