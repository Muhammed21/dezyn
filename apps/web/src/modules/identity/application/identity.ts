import { z } from "zod";

import { err, type Result } from "@repo/result";

import type { Credentials, Registration, Session } from "../domain/session.ts";
import type { IdentityGateway, SignUpFailure } from "./identity-gateway.ts";

export const identityUseCases = ({ gateway }: { readonly gateway: IdentityGateway }) => ({
  signIn: (credentials: Credentials) => gateway.signIn(credentials),
  signUp: async (registration: Registration): Promise<Result<Session, SignUpFailure>> => {
    const name = registration.name.trim();
    if (name === "") {
      return err("invalid_name");
    }
    if (!z.email().safeParse(registration.email).success) {
      return err("invalid_email");
    }
    return gateway.signUp({ ...registration, name });
  },
  currentSession: () => gateway.currentSession(),
});
