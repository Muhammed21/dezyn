import type { LotState, PropositionLot } from "./proposition.ts";

export const closeLot = (lot: PropositionLot): PropositionLot => ({ ...lot, state: "closed" });

export const declareLot = ({
  current,
  declared,
}: {
  readonly current: PropositionLot | undefined;
  readonly declared: PropositionLot;
}) => ({ lot: declared, closed: current === undefined ? null : closeLot(current) });

const IDLE_LIMIT_MS = 30 * 60 * 1000;

export const lotStateAt = ({
  lot,
  now,
}: {
  readonly lot: Pick<PropositionLot, "state" | "lastWrittenAt">;
  readonly now: Date;
}): LotState =>
  lot.state === "open" && now.getTime() - lot.lastWrittenAt.getTime() < IDLE_LIMIT_MS
    ? "open"
    : "closed";
