import { identityUseCases } from "./application/identity.ts";
import { createHttpIdentityGateway, type Fetch } from "./infrastructure/http-identity-gateway.ts";

export const createIdentity = (options: { readonly apiUrl: string; readonly fetch: Fetch }) =>
  identityUseCases({ gateway: createHttpIdentityGateway(options) });
