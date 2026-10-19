import { and, eq, isNull } from "drizzle-orm";

import type { PostgresDatabase } from "#db";
import { schema } from "@repo/db";

import type { MembershipReader } from "../application/membership-reader.ts";
import { StoredMembership } from "./stored-rows.ts";

const { spaceMember } = schema;

export const postgresMembershipReader = (db: PostgresDatabase): MembershipReader => ({
  activeMembership: async ({ spaceId, userId }) => {
    const [row] = await db.orm
      .select({ spaceId: spaceMember.spaceId, userId: spaceMember.userId, role: spaceMember.role })
      .from(spaceMember)
      .where(
        and(
          eq(spaceMember.spaceId, spaceId),
          eq(spaceMember.userId, userId),
          isNull(spaceMember.closedAt),
        ),
      );
    return row === undefined ? undefined : StoredMembership.parse(row);
  },
});
