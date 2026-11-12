import type { z } from "zod";

import { ProposalBatchesOutput } from "@repo/contracts";
import { err, ok } from "@repo/result";

import { failureOf, type Fetch, parseJson, send } from "../../../platform/http.ts";
import type { ProposalGateway } from "../application/proposal-gateway.ts";
import type { BatchState, BatchSummary } from "../domain/proposal.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

type BatchOutput = z.infer<typeof ProposalBatchesOutput>["batches"][number];

const stateOf = (state: string): BatchState =>
  state === "open" || state === "closed" ? state : "unknown";

const batchOf = ({ id, intent, state, toReview }: BatchOutput): BatchSummary => ({
  id,
  intent: intent ?? undefined,
  state: stateOf(state),
  toReview,
});

export const createHttpProposalGateway = ({
  apiUrl,
  fetch,
}: {
  readonly apiUrl: string;
  readonly fetch: Fetch;
}): ProposalGateway => ({
  listBatches: async ({ projectId }) => {
    const sent = await send(fetch, `${apiUrl}/v1/projects/${projectId}/proposal-batches`, {
      method: "GET",
    });
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
    const body = await parseJson(response, ProposalBatchesOutput);
    return body.ok ? ok(body.value.batches.map(batchOf)) : body;
  },
});
