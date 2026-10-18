import type { auditProjectCall } from "./audit-project-call.ts";
import type { readHistory } from "./read-history.ts";

export type HistoryUseCases = {
  readonly readHistory: ReturnType<typeof readHistory>;
  readonly auditProjectCall: ReturnType<typeof auditProjectCall>;
};
