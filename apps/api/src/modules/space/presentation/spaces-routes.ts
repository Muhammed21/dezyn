import { type Context, Hono } from "hono";
import { z } from "zod";

import type { AuthenticatedEnv } from "#platform/access-token.ts";
import { problemResponse } from "#platform/problem.ts";
import { validate } from "#platform/validate.ts";
import { Uuid } from "@repo/contracts";

import type { InvitationFailure } from "../application/invite-member.ts";
import type { DepartureFailure } from "../application/leave-space.ts";
import type { RemovalFailure, RoleChangeFailure } from "../application/manage-members.ts";
import type { SpaceUseCases } from "../application/spaces.ts";
import { ROLES } from "../domain/space.ts";
import { alreadyMemberProblem } from "./already-member-problem.ts";
import { planRequiredProblem } from "./plan-required-problem.ts";

const InvitationRequest = z.object({ email: z.email() });

const RoleRequest = z.object({ role: z.enum(ROLES) });

const spaceIdOf = (c: Context<AuthenticatedEnv>) => Uuid.safeParse(c.req.param("spaceId")).data;

const invitationProblem = (c: Context<AuthenticatedEnv>, failure: InvitationFailure) => {
  if (failure === "not_found") {
    return c.notFound();
  }
  if (failure === "forbidden") {
    return forbiddenProblem(c);
  }
  if (failure === "already_member") {
    return alreadyMemberProblem(c);
  }
  if (failure === "mail_unavailable") {
    return problemResponse(c, {
      type: "about:blank",
      title: "Email d'invitation non envoyé",
      status: 503,
    });
  }
  return planRequiredProblem(c, failure);
};

const lastOwnerProblem = (c: Context<AuthenticatedEnv>) =>
  problemResponse(c, {
    type: "https://dezyn.app/problems/last-owner",
    title: "Dernier propriétaire de l'espace",
    status: 409,
  });

const forbiddenProblem = (c: Context<AuthenticatedEnv>) =>
  problemResponse(c, { type: "about:blank", title: "Accès refusé", status: 403 });

const departureProblem = (c: Context<AuthenticatedEnv>, failure: DepartureFailure) =>
  failure === "not_found" ? c.notFound() : lastOwnerProblem(c);

const roleChangeProblem = (c: Context<AuthenticatedEnv>, failure: RoleChangeFailure) => {
  if (failure === "not_found") {
    return c.notFound();
  }
  return failure === "forbidden" ? forbiddenProblem(c) : lastOwnerProblem(c);
};

const removalProblem = (c: Context<AuthenticatedEnv>, failure: RemovalFailure) => {
  if (failure === "not_found") {
    return c.notFound();
  }
  return failure === "forbidden"
    ? forbiddenProblem(c)
    : problemResponse(c, {
        type: "https://dezyn.app/problems/self-removal",
        title: "Un membre quitte l'espace par son départ",
        status: 409,
      });
};

export const spacesRoutes = ({
  listMySpaces,
  readSpace,
  inviteMember,
  leaveSpace,
  changeRole,
  removeMember,
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
    })
    .patch("/:spaceId/members/:memberId", validate("json", RoleRequest), async (c) => {
      const spaceId = spaceIdOf(c);
      if (spaceId === undefined) {
        return c.notFound();
      }
      const memberId = c.req.param("memberId");
      const changed = await changeRole({
        spaceId,
        userId: c.get("identity").userId,
        memberId,
        role: c.req.valid("json").role,
      });
      return changed.ok ? c.json(changed.value) : roleChangeProblem(c, changed.error);
    })
    .delete("/:spaceId/members/:memberId", async (c) => {
      const spaceId = spaceIdOf(c);
      if (spaceId === undefined) {
        return c.notFound();
      }
      const memberId = c.req.param("memberId");
      const removed = await removeMember({ spaceId, userId: c.get("identity").userId, memberId });
      return removed.ok ? c.body(null, 204) : removalProblem(c, removed.error);
    });
