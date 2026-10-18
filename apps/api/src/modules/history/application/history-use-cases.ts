import type { readHistory } from "./read-history.ts";

export type HistoryUseCases = {
  readonly readHistory: ReturnType<typeof readHistory>;
};
