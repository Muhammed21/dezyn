import type { Result } from "@repo/result";

import type { HistoryEntry } from "./read-history.ts";

export type HistoryUseCases = {
  readonly readHistory: (request: {
    readonly projectId: string;
    readonly userId: string;
  }) => Promise<Result<readonly HistoryEntry[], "not_found">>;
};
