import type { Fetch } from "../../platform/http.ts";
import { tokenUseCases } from "./application/tokens.ts";
import { createHttpTokenGateway } from "./infrastructure/http-token-gateway.ts";

export const createTokens = (options: { readonly apiUrl: string; readonly fetch: Fetch }) =>
  tokenUseCases({ gateway: createHttpTokenGateway(options) });
