import type { PropositionLot } from "./proposition.ts";

export const closeLot = (lot: PropositionLot): PropositionLot => ({ ...lot, state: "closed" });

export const declareLot = ({
  current,
  declared,
}: {
  readonly current: PropositionLot | undefined;
  readonly declared: PropositionLot;
}) => ({ lot: declared, closed: current === undefined ? null : closeLot(current) });
