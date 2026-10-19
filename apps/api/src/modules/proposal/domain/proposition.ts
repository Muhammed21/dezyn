import type { TokenDefinition } from "../../token/contracts/token-definition.ts";

export type LotState = "open" | "closed";

export type PropositionLot = {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly clientId: string;
  readonly intention: string | null;
  readonly state: LotState;
  readonly openedAt: Date;
  readonly lastWrittenAt: Date;
};

export type Proposition = {
  readonly id: string;
  readonly lotId: string;
  readonly name: string;
  readonly kind: "create" | "update";
  readonly token: TokenDefinition;
  readonly status: PropositionStatus;
  readonly createdAt: Date;
};

export type PropositionStatus = "proposed" | "validated" | "rejected" | "replaced";

export type Decision = "validate" | "reject";

const REVIEWED: Readonly<Record<Decision, "validated" | "rejected">> = {
  validate: "validated",
  reject: "rejected",
};

export const review = ({
  status,
  decision,
}: {
  readonly status: PropositionStatus;
  readonly decision: Decision;
}): { readonly status: "validated" | "rejected" } | { readonly refusal: "already_reviewed" } =>
  status === "proposed" ? { status: REVIEWED[decision] } : { refusal: "already_reviewed" };
