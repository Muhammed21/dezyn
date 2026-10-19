import { type Context, Hono } from "hono";

import type { AuthenticatedEnv } from "#platform/access-token.ts";
import { problemResponse } from "#platform/problem.ts";

import type { SpaceUseCases } from "../application/spaces.ts";
import type { AcceptanceRefusal } from "../domain/acceptance.ts";
import { alreadyMemberProblem } from "./already-member-problem.ts";
import { planRequiredProblem } from "./plan-required-problem.ts";

const acceptanceProblem = (c: Context<AuthenticatedEnv>, refusal: AcceptanceRefusal) => {
  if (refusal === "gone") {
    return problemResponse(c, {
      type: "about:blank",
      title: "Invitation expirée ou déjà utilisée",
      status: 410,
    });
  }
  if (refusal === "email_mismatch") {
    return problemResponse(c, {
      type: "about:blank",
      title: "Invitation adressée à un autre email",
      status: 403,
    });
  }
  if (refusal === "already_member") {
    return alreadyMemberProblem(c);
  }
  return planRequiredProblem(c, refusal);
};

export const invitationsRoutes = ({ acceptInvitation }: SpaceUseCases) =>
  new Hono<AuthenticatedEnv>().post("/:token/accept", async (c) => {
    const accepted = await acceptInvitation({
      token: c.req.param("token"),
      userId: c.get("identity").userId,
    });
    return accepted.ok ? c.json(accepted.value) : acceptanceProblem(c, accepted.error);
  });
