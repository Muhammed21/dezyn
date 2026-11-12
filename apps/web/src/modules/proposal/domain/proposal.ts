export type BatchState = "open" | "closed" | "unknown";

export type BatchSummary = {
  readonly id: string;
  readonly intent: string | undefined;
  readonly state: BatchState;
  readonly toReview: number;
};

export type ProposalFailure = "unauthenticated" | "not_found" | "unavailable" | "invalid_response";
