import { referencedNames } from "#modules/token/contracts/token-definition.ts";

import type { BatchState, Proposal } from "./proposal.ts";

export type BatchPlan =
  | { readonly refusal: "batch_open" }
  | { readonly refusal: "unknown_propositions"; readonly ids: readonly string[] }
  | { readonly toValidate: readonly Proposal[]; readonly toReject: readonly Proposal[] };

const targetsFirst = (
  remaining: readonly Proposal[],
  placed: readonly Proposal[] = [],
): readonly Proposal[] => {
  const waiting = new Set(remaining.map(({ name }) => name));
  const ready = remaining.find((proposal) =>
    referencedNames(proposal.token).every((name) => !waiting.has(name)),
  );
  if (ready === undefined) {
    return [...placed, ...remaining];
  }
  return targetsFirst(
    remaining.filter((proposal) => proposal !== ready),
    [...placed, ready],
  );
};

export const planBatchValidation = ({
  batchState,
  proposals,
  rejected,
}: {
  readonly batchState: BatchState;
  readonly proposals: readonly Proposal[];
  readonly rejected: readonly string[];
}): BatchPlan => {
  if (batchState === "open") {
    return { refusal: "batch_open" };
  }
  const unknown = rejected.filter((id) => !proposals.some((proposal) => proposal.id === id));
  if (unknown.length > 0) {
    return { refusal: "unknown_propositions", ids: unknown };
  }
  const proposed = proposals.filter(({ status }) => status === "proposed");
  return {
    toValidate: targetsFirst(proposed.filter(({ id }) => !rejected.includes(id))),
    toReject: proposed.filter(({ id }) => rejected.includes(id)),
  };
};
