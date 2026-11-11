import type { Context } from "hono";

import type { MemberEnv } from "#platform/member-identity.ts";
import { problemResponse } from "#platform/problem.ts";

export const alreadyMemberProblem = (c: Context<MemberEnv>) =>
  problemResponse(c, { type: "about:blank", title: "Déjà membre de l'espace", status: 409 });
