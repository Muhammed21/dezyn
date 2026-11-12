import type { Fetch } from "../../platform/http.ts";
import { proposalUseCases } from "./application/proposals.ts";
import { createHttpProposalGateway } from "./infrastructure/http-proposal-gateway.ts";

export const createProposals = (options: { readonly apiUrl: string; readonly fetch: Fetch }) =>
  proposalUseCases({ gateway: createHttpProposalGateway(options) });
