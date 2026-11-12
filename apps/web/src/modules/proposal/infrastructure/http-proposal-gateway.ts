import type { z } from "zod";

import { ProposalBatchesOutput, ProposalBatchOutput } from "@repo/contracts";
import { err, ok, type Result } from "@repo/result";

import { failureOf, type Fetch, parseJson, send } from "../../../platform/http.ts";
import type { ProposalGateway } from "../application/proposal-gateway.ts";
import type {
  BatchState,
  BatchSummary,
  Proposal,
  ProposalFailure,
  ProposalKind,
  ProposalStatus,
} from "../domain/proposal.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

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
});
