import { type Context, Hono } from "hono";
import { z } from "zod";

import { Uuid } from "@repo/contracts";

import type { AuthenticatedEnv } from "../../../platform/access-token.ts";
import { problemResponse } from "../../../platform/problem.ts";
import { validate } from "../../../platform/validate.ts";
import type { InvitationFailure } from "../application/invite-member.ts";
import type { DepartureFailure } from "../application/leave-space.ts";
import type { SpaceUseCases } from "../application/spaces.ts";
import { alreadyMemberProblem } from "./already-member-problem.ts";
import { planRequiredProblem } from "./plan-required-problem.ts";

const InvitationRequest = z.object({ email: z.email() });

const spaceIdOf = (c: Context<AuthenticatedEnv>) => Uuid.safeParse(c.req.param("spaceId")).data;

const invitationProblem = (c: Context<AuthenticatedEnv>, failure: InvitationFailure) => {
  if (failure === "not_found") {
    return c.notFound();
  }
  if (failure === "forbidden") {
    return problemResponse(c, { type: "about:blank", title: "Accès refusé", status: 403 });
  }
  if (failure === "already_member") {
    return alreadyMemberProblem(c);
  }
  return planRequiredProblem(c, failure);
};

const departureProblem = (c: Context<AuthenticatedEnv>, failure: DepartureFailure) =>
  failure === "not_found"
    ? c.notFound()
    : problemResponse(c, {
        type: "https://dezyn.app/problems/last-owner",
        title: "Dernier propriétaire de l'espace",
        status: 409,
      });

export const spacesRoutes = ({
  listMySpaces,
  readSpace,
  inviteMember,
  leaveSpace,
}: SpaceUseCases) =>
  new Hono<AuthenticatedEnv>()
    .get("/", async (c) => c.json({ spaces: await listMySpaces(c.get("identity").userId) }))
    .get("/:spaceId", async (c) => {
      const spaceId = spaceIdOf(c);
      if (spaceId === undefined) {
        return c.notFound();
      }
      const space = await readSpace({ spaceId, userId: c.get("identity").userId });
      return space.ok ? c.json(space.value) : c.notFound();
    })
    .post("/:spaceId/invitations", validate("json", InvitationRequest), async (c) => {
      const spaceId = spaceIdOf(c);
      if (spaceId === undefined) {
        return c.notFound();
      }
      const invitation = await inviteMember({
        spaceId,
        userId: c.get("identity").userId,
        email: c.req.valid("json").email,
      });
      return invitation.ok ? c.json(invitation.value, 201) : invitationProblem(c, invitation.error);
    })
    .delete("/:spaceId/members/me", async (c) => {
      const spaceId = spaceIdOf(c);
      if (spaceId === undefined) {
        return c.notFound();
      }
      const left = await leaveSpace({ spaceId, userId: c.get("identity").userId });
      return left.ok ? c.body(null, 204) : departureProblem(c, left.error);
    });
