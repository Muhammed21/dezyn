import type { Credentials } from "../domain/session.ts";
import type { IdentityGateway } from "./identity-gateway.ts";

export const identityUseCases = ({ gateway }: { readonly gateway: IdentityGateway }) => ({
  signIn: (credentials: Credentials) => gateway.signIn(credentials),
  currentSession: () => gateway.currentSession(),
});
