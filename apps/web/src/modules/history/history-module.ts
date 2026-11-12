import type { Fetch } from "../../platform/http.ts";
import { historyUseCases } from "./application/history.ts";
import { createHttpHistoryGateway } from "./infrastructure/http-history-gateway.ts";

export const createHistory = (options: { readonly apiUrl: string; readonly fetch: Fetch }) =>
  historyUseCases({ gateway: createHttpHistoryGateway(options) });
