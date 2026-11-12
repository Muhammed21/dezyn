import { Uuid } from "@repo/contracts";
import { err, type Result } from "@repo/result";

import type { HistoryFailure, HistoryPage } from "../domain/history.ts";
import type { HistoryGateway } from "./history-gateway.ts";

export const historyUseCases = ({ gateway }: { readonly gateway: HistoryGateway }) => ({
  readHistory: async ({
    projectId,
  }: {
    readonly projectId: string;
  }): Promise<Result<HistoryPage, HistoryFailure>> =>
    Uuid.safeParse(projectId).success ? gateway.readHistory({ projectId }) : err("not_found"),
});
