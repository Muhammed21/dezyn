import type { BatchState, ProposalBatch } from "./proposal.ts";

export const closedBatch = (batch: ProposalBatch): ProposalBatch => ({ ...batch, state: "closed" });

export const declareBatch = ({
  current,
  declared,
}: {
  readonly current: ProposalBatch | undefined;
  readonly declared: ProposalBatch;
}) => ({ batch: declared, closed: current === undefined ? null : closedBatch(current) });

const IDLE_LIMIT_MS = 30 * 60 * 1000;

export const batchStateAt = ({
  batch,
  now,
}: {
  readonly batch: Pick<ProposalBatch, "state" | "lastWrittenAt">;
  readonly now: Date;
}): BatchState =>
  batch.state === "open" && now.getTime() - batch.lastWrittenAt.getTime() < IDLE_LIMIT_MS
    ? "open"
    : "closed";
