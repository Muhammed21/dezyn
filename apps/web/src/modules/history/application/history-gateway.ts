import type { Result } from "@repo/result";

import type { HistoryFailure, HistoryPage } from "../domain/history.ts";

export type HistoryGateway = {
  readonly readHistory: (project: {
    readonly projectId: string;
    readonly cursor?: string;
  }) => Promise<Result<HistoryPage, HistoryFailure>>;
};
