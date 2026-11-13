import type { z } from "zod";

import {
  AlreadyReviewedProblem,
  BatchOpenProblem,
  InvalidBatchProblem,
  InvalidProposalProblem,
  ProposalBatchesOutput,
  ProposalBatchOutput,
  ReviewedProposalOutput,
  ValidatedBatchOutput,
} from "@repo/contracts";
import { err, ok, type Result } from "@repo/result";

import { failureOf, type Fetch, parseJson, send } from "../../../platform/http.ts";
import type { ProposalGateway } from "../application/proposal-gateway.ts";
import type {
  BatchState,
  BatchSummary,
  BatchValidationFailure,
  Proposal,
  ProposalFailure,
  ProposalKind,
  ProposalStatus,
  ReviewFailure,
} from "../domain/proposal.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const CONFLICT = 409;

type BatchSummaryOutput = z.infer<typeof ProposalBatchesOutput>["batches"][number];

type ProposalOutput = z.infer<typeof ProposalBatchOutput>["proposals"][number];

const stateOf = (state: string): BatchState =>
  state === "open" || state === "closed" ? state : "unknown";

const kindOf = (kind: string): ProposalKind =>
  kind === "create" || kind === "update" ? kind : "unknown";

const STATUSES: ReadonlySet<string> = new Set(["proposed", "validated", "rejected", "replaced"]);

const isKnownStatus = (status: string): status is Exclude<ProposalStatus, "unknown"> =>
  STATUSES.has(status);

const statusOf = (status: string): ProposalStatus => (isKnownStatus(status) ? status : "unknown");

const batchSummaryOf = ({ id, intent, state, toReview }: BatchSummaryOutput): BatchSummary => ({
  id,
  intent: intent ?? undefined,
  state: stateOf(state),
  toReview,
});

const proposalOf = ({ id, name, kind, status, validated, proposed }: ProposalOutput): Proposal => ({
  id,
  name,
  kind: kindOf(kind),
  status: statusOf(status),
  validated: validated ?? undefined,
  proposed,
});

const read = async <Body>(
  fetch: Fetch,
  url: string,
  schema: z.ZodType<Body>,
): Promise<Result<Body, ProposalFailure>> => {
  const sent = await send(fetch, url, { method: "GET" });
  if (!sent.ok) {
    return sent;
  }
  const response = sent.value;
  if (response.status === UNAUTHORIZED) {
    return err("unauthenticated");
  }
  if (response.status === NOT_FOUND) {
    return err("not_found");
  }
  if (response.status !== OK) {
    return err(failureOf(response));
  }
  return parseJson(response, schema);
};

const conflictOf = async (response: Response): Promise<ReviewFailure> => {
  const body: unknown = await response.json().catch(() => undefined);
  if (AlreadyReviewedProblem.safeParse(body).success) {
    return "already_reviewed";
  }
  const invalid = InvalidProposalProblem.safeParse(body);
  return invalid.success
    ? {
        reason: "invalid_proposal",
        errors: invalid.data.errors.map(({ path, message }) => ({ path, message })),
      }
    : "invalid_response";
};

const reviewRefusalOf = async (response: Response): Promise<ReviewFailure> => {
  if (response.status === UNAUTHORIZED) {
    return "unauthenticated";
  }
  if (response.status === NOT_FOUND) {
    return "not_found";
  }
  if (response.status === CONFLICT) {
    return conflictOf(response);
  }
  return failureOf(response);
};

const batchConflictOf = async (response: Response): Promise<BatchValidationFailure> => {
  const body: unknown = await response.json().catch(() => undefined);
  if (BatchOpenProblem.safeParse(body).success) {
    return "batch_open";
  }
  const invalid = InvalidBatchProblem.safeParse(body);
  return invalid.success
    ? {
        reason: "invalid_batch",
        errors: invalid.data.errors.map(({ path, message }) => ({ path, message })),
      }
    : "invalid_response";
};

const validationRefusalOf = async (response: Response): Promise<BatchValidationFailure> => {
  if (response.status === UNAUTHORIZED) {
    return "unauthenticated";
  }
  if (response.status === NOT_FOUND) {
    return "not_found";
  }
  if (response.status === CONFLICT) {
    return batchConflictOf(response);
  }
  return failureOf(response);
};

export const createHttpProposalGateway = ({
  apiUrl,
  fetch,
}: {
  readonly apiUrl: string;
  readonly fetch: Fetch;
}): ProposalGateway => ({
  listBatches: async ({ projectId }) => {
    const body = await read(
      fetch,
      `${apiUrl}/v1/projects/${projectId}/proposal-batches`,
      ProposalBatchesOutput,
    );
    return body.ok ? ok(body.value.batches.map(batchSummaryOf)) : body;
  },
  readBatch: async ({ batchId }) => {
    const body = await read(fetch, `${apiUrl}/v1/proposal-batches/${batchId}`, ProposalBatchOutput);
    if (!body.ok) {
      return body;
    }
    const { id, projectId, intent, state, proposals } = body.value;
    return ok({
      id,
      projectId,
      intent: intent ?? undefined,
      state: stateOf(state),
      proposals: proposals.map(proposalOf),
    });
  },
  reviewProposal: async ({ proposalId, decision }) => {
    const sent = await send(fetch, `${apiUrl}/v1/proposals/${proposalId}/${decision}`, {
      method: "POST",
    });
    if (!sent.ok) {
      return sent;
    }
    const response = sent.value;
    if (response.status !== OK) {
      return err(await reviewRefusalOf(response));
    }
    const body = await parseJson(response, ReviewedProposalOutput);
    if (!body.ok) {
      return body;
    }
    const { id, name, kind, status } = body.value;
    return ok({ id, name, kind: kindOf(kind), status: statusOf(status) });
  },
  validateBatch: async ({ batchId, rejected }) => {
    const sent = await send(fetch, `${apiUrl}/v1/proposal-batches/${batchId}/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rejected }),
    });
    if (!sent.ok) {
      return sent;
    }
    const response = sent.value;
    if (response.status !== OK) {
      return err(await validationRefusalOf(response));
    }
    const body = await parseJson(response, ValidatedBatchOutput);
    return body.ok ? ok({ validated: body.value.validated, rejected: body.value.rejected }) : body;
  },
});
