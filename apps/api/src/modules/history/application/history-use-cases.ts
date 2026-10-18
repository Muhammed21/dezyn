import type { readHistory } from "./read-history.ts";
import type { recordProjectCall } from "./record-project-call.ts";

export type HistoryUseCases = {
  readonly readHistory: ReturnType<typeof readHistory>;
  readonly recordProjectCall: ReturnType<typeof recordProjectCall>;
};
