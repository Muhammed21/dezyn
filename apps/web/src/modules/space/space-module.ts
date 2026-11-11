import type { Fetch } from "../../platform/http.ts";
import { spaceUseCases } from "./application/spaces.ts";
import { createHttpSpaceGateway } from "./infrastructure/http-space-gateway.ts";

export const createSpaces = (options: { readonly apiUrl: string; readonly fetch: Fetch }) =>
  spaceUseCases({ gateway: createHttpSpaceGateway(options) });
