import { z } from "zod";

import { openEnum, Uuid } from "../conventions/schemas.ts";
import { TokenValueOutput } from "../token/tokens.ts";

export const BATCH_STATES = ["open", "closed"] as const;

export const PROPOSAL_KINDS = ["create", "update"] as const;

export const PROPOSAL_STATUSES = ["proposed", "validated", "rejected", "replaced"] as const;

const BatchState = openEnum(BATCH_STATES);

const ReviewedProposal = {
  id: Uuid,
  name: z.string(),
  kind: openEnum(PROPOSAL_KINDS),
  status: openEnum(PROPOSAL_STATUSES),
};

export const ProposalBatchesOutput = z.looseObject({
  batches: z.array(
    z.looseObject({
      id: Uuid,
      intent: z.string().nullable(),
      state: BatchState,
      toReview: z.int().nonnegative(),
    }),
  ),
});

export const ProposalBatchOutput = z.looseObject({
  id: Uuid,
  projectId: Uuid,
  intent: z.string().nullable(),
  state: BatchState,
  proposals: z.array(
    z.looseObject({
      ...ReviewedProposal,
      validated: TokenValueOutput.nullable(),
      proposed: TokenValueOutput,
    }),
  ),
});

export const ReviewedProposalOutput = z.looseObject(ReviewedProposal);

export const ValidatedBatchOutput = z.looseObject({
  id: Uuid,
  state: BatchState,
  validated: z.array(Uuid),
  rejected: z.array(Uuid),
});

export const AlreadyReviewedProblem = z.looseObject({
  type: z.literal("https://dezyn.dev/problems/already-reviewed"),
  title: z.string(),
  status: z.literal(409),
});

export const InvalidProposalProblem = z.looseObject({
  type: z.literal("https://dezyn.dev/problems/invalid-proposal"),
  title: z.string(),
  status: z.literal(409),
  errors: z.array(z.looseObject({ path: z.string(), message: z.string() })),
});
