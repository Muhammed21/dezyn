import type { Context } from "hono";

import type { AuthenticatedEnv } from "#platform/access-token.ts";
import { problemResponse } from "#platform/problem.ts";

export const alreadyMemberProblem = (c: Context<AuthenticatedEnv>) =>
  problemResponse(c, { type: "about:blank", title: "Déjà membre de l'espace", status: 409 });
