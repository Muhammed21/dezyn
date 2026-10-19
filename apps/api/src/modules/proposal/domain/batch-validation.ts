import { referencedNames } from "../../token/contracts/token-definition.ts";
import type { LotState, Proposition } from "./proposition.ts";

export type BatchPlan =
  | { readonly refusal: "batch_open" }
  | { readonly refusal: "unknown_propositions"; readonly ids: readonly string[] }
  | { readonly toValidate: readonly Proposition[]; readonly toReject: readonly Proposition[] };

const targetsFirst = (
  remaining: readonly Proposition[],
  placed: readonly Proposition[] = [],
): readonly Proposition[] => {
  const waiting = new Set(remaining.map(({ name }) => name));
  const ready = remaining.find((proposition) =>
    referencedNames(proposition.token).every((name) => !waiting.has(name)),
  );
  if (ready === undefined) {
    return [...placed, ...remaining];
  }
  return targetsFirst(
    remaining.filter((proposition) => proposition !== ready),
    [...placed, ready],
  );
};

export const planBatchValidation = ({
  lotState,
  propositions,
  rejected,
}: {
  readonly lotState: LotState;
  readonly propositions: readonly Proposition[];
  readonly rejected: readonly string[];
}): BatchPlan => {
  if (lotState === "open") {
    return { refusal: "batch_open" };
  }
  const unknown = rejected.filter(
    (id) => !propositions.some((proposition) => proposition.id === id),
  );
  if (unknown.length > 0) {
    return { refusal: "unknown_propositions", ids: unknown };
  }
  const proposed = propositions.filter(({ status }) => status === "proposed");
  return {
    toValidate: targetsFirst(proposed.filter(({ id }) => !rejected.includes(id))),
    toReject: proposed.filter(({ id }) => rejected.includes(id)),
  };
};
