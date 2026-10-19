import type { TokenDefinition } from "#modules/token/contracts/token-definition.ts";

export type BatchState = "open" | "closed";

export type ProposalBatch = {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly clientId: string;
  readonly intent: string | null;
  readonly state: BatchState;
  readonly openedAt: Date;
  readonly lastWrittenAt: Date;
};

export type Proposal = {
  readonly id: string;
  readonly batchId: string;
  readonly name: string;
  readonly kind: "create" | "update";
  readonly token: TokenDefinition;
  readonly status: ProposalStatus;
  readonly createdAt: Date;
};

export type ProposalStatus = "proposed" | "validated" | "rejected" | "replaced";

export type Decision = "validate" | "reject";

const REVIEWED: Readonly<Record<Decision, "validated" | "rejected">> = {
  validate: "validated",
  reject: "rejected",
};

export const review = ({
  status,
  decision,
}: {
  readonly status: ProposalStatus;
  readonly decision: Decision;
}): { readonly status: "validated" | "rejected" } | { readonly refusal: "already_reviewed" } =>
  status === "proposed" ? { status: REVIEWED[decision] } : { refusal: "already_reviewed" };
