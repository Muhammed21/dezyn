export type BatchState = "open" | "closed" | "unknown";

export type BatchSummary = {
  readonly id: string;
  readonly intent: string | undefined;
  readonly state: BatchState;
  readonly toReview: number;
};

export type ProposalKind = "create" | "update" | "unknown";

export type ProposalStatus = "proposed" | "validated" | "rejected" | "replaced" | "unknown";

export type TokenValue = Readonly<Record<string, unknown>>;

export type Proposal = {
  readonly id: string;
  readonly name: string;
  readonly kind: ProposalKind;
  readonly status: ProposalStatus;
  readonly validated: TokenValue | undefined;
  readonly proposed: TokenValue;
};

export type Batch = {
  readonly id: string;
  readonly projectId: string;
  readonly intent: string | undefined;
  readonly state: BatchState;
  readonly proposals: readonly Proposal[];
};

export type ProposalFailure = "unauthenticated" | "not_found" | "unavailable" | "invalid_response";
