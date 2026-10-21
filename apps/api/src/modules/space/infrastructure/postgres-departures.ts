import { and, eq, isNull } from "drizzle-orm";

import type { PostgresDatabase } from "#db";
import { schema } from "@repo/db";
import { err, ok } from "@repo/result";

import type { Departures } from "../application/leave-space.ts";
import { StoredMembership } from "./stored-rows.ts";

const { space, spaceMember } = schema;

export const postgresDepartures = (db: PostgresDatabase): Departures => ({
  leave: ({ spaceId, userId }, decide) =>
    db.orm.transaction(async (tx) => {
      await tx.select({ id: space.id }).from(space).where(eq(space.id, spaceId)).for("update");
      const rows = await tx
        .select({
          spaceId: spaceMember.spaceId,
          userId: spaceMember.userId,
          role: spaceMember.role,
        })
        .from(spaceMember)
        .where(and(eq(spaceMember.spaceId, spaceId), isNull(spaceMember.closedAt)));
      const members = rows.map((row) => StoredMembership.parse(row));
      const decision = decide({
        membership: members.find((member) => member.userId === userId),
        openOwners: members.filter((member) => member.role === "owner").length,
      });
      if (!decision.ok) {
        return err(decision.error);
      }
      await tx
        .update(spaceMember)
        .set({ closedAt: decision.value.closedAt, closedReason: "left" })
        .where(
          and(
            eq(spaceMember.spaceId, spaceId),
            eq(spaceMember.userId, userId),
            isNull(spaceMember.closedAt),
          ),
        );
      return ok(undefined);
    }),
});
