import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { schema } from "@repo/db";
import { err, ok } from "@repo/result";

import type { PostgresDatabase, PostgresTransaction } from "../../../platform/postgres-database.ts";
import type { InvitationAcceptance } from "../application/accept-invitation.ts";
import { StoredSpace } from "./stored-rows.ts";

const { identityUser, space, spaceInvitation, spaceMember } = schema;

const StoredUser = z.object({ email: z.string() });

const lockedFactsOf = async (
  tx: PostgresTransaction,
  { tokenHash, userId }: { readonly tokenHash: string; readonly userId: string },
) => {
  const [invitation] = await tx
    .select({
      id: spaceInvitation.id,
      spaceId: spaceInvitation.spaceId,
      email: spaceInvitation.email,
      expiresAt: spaceInvitation.expiresAt,
      acceptedAt: spaceInvitation.acceptedAt,
    })
    .from(spaceInvitation)
    .where(eq(spaceInvitation.tokenHash, tokenHash))
    .for("update");
  if (invitation === undefined) {
    return undefined;
  }
  const [row] = await tx
    .select({ id: space.id, name: space.name, plan: space.plan })
    .from(space)
    .where(eq(space.id, invitation.spaceId))
    .for("update");
  const target = StoredSpace.parse(row);
  const [user] = await tx
    .select({ email: identityUser.email })
    .from(identityUser)
    .where(eq(identityUser.id, userId));
  const openMemberships = await tx
    .select({ id: spaceMember.id })
    .from(spaceMember)
    .where(
      and(
        eq(spaceMember.spaceId, target.id),
        eq(spaceMember.userId, userId),
        isNull(spaceMember.closedAt),
      ),
    );
  return {
    invitationId: invitation.id,
    target,
    facts: {
      invitation,
      plan: target.plan,
      alreadyMember: openMemberships.length > 0,
      email: StoredUser.parse(user).email,
    },
  };
};

export const postgresInvitationAcceptance = (db: PostgresDatabase): InvitationAcceptance => ({
  accept: (request, decide) =>
    db.orm.transaction(async (tx) => {
      const locked = await lockedFactsOf(tx, request);
      if (locked === undefined) {
        return err("gone");
      }
      const decision = decide(locked.facts);
      if (!decision.ok) {
        return err(decision.error);
      }
      await tx.insert(spaceMember).values({
        id: decision.value.id,
        spaceId: locked.target.id,
        userId: request.userId,
        role: "editor",
        joinedAt: decision.value.joinedAt,
      });
      await tx
        .update(spaceInvitation)
        .set({ acceptedAt: decision.value.joinedAt })
        .where(eq(spaceInvitation.id, locked.invitationId));
      return ok({ ...locked.target, role: "editor" });
    }),
});
