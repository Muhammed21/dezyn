import { and, eq, isNull } from "drizzle-orm";

import type { PostgresDatabase } from "#db";
import { schema } from "@repo/db";

import type { MemberManagement } from "../application/manage-members.ts";
import { StoredMembership } from "./stored-rows.ts";

const { space, spaceMember } = schema;

export const postgresMemberManagement = (db: PostgresDatabase): MemberManagement => ({
  run: (spaceId, work) =>
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
      return work({
        members: rows.map((row) => StoredMembership.parse(row)),
        close: async ({ userId, reason, closedAt }) => {
          await tx
            .update(spaceMember)
            .set({ closedAt, closedReason: reason })
            .where(
              and(
                eq(spaceMember.spaceId, spaceId),
                eq(spaceMember.userId, userId),
                isNull(spaceMember.closedAt),
              ),
            );
        },
        open: async ({ id, userId, role, joinedAt }) => {
          await tx.insert(spaceMember).values({ id, spaceId, userId, role, joinedAt });
        },
      });
    }),
});
