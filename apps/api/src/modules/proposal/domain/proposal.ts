import type { TokenDefinition } from "#modules/token/contracts/token-definition.ts";

export const BATCH_STATES = ["open", "closed"] as const;

export type BatchState = (typeof BATCH_STATES)[number];

export const PROPOSAL_KINDS = ["create", "update"] as const;

export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

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
  readonly kind: ProposalKind;
  readonly token: TokenDefinition;
  readonly status: ProposalStatus;
  readonly createdAt: Date;
};

export const PROPOSAL_STATUSES = ["proposed", "validated", "rejected", "replaced"] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

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
