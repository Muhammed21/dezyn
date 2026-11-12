export type HistoryAuthor =
  | { readonly kind: "member"; readonly name: string; readonly left: boolean }
  | { readonly kind: "unknown" };

export type HistoryEntry = {
  readonly id: string;
  readonly action: string;
  readonly author: HistoryAuthor;
  readonly clientId: string | undefined;
  readonly occurredAt: Date;
};

export type HistoryPage = {
  readonly entries: readonly HistoryEntry[];
  readonly purgedBefore: Date | undefined;
  readonly nextCursor: string | undefined;
};

export type HistoryFailure = "unauthenticated" | "not_found" | "unavailable" | "invalid_response";
