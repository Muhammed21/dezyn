import { and, eq, isNull, sql } from "drizzle-orm";

import type { PostgresDatabase } from "#db";
import { schema } from "@repo/db";

import type { MemberDirectory } from "../application/invite-member.ts";

const { identityUser, spaceMember } = schema;

export const postgresMemberDirectory = (db: PostgresDatabase): MemberDirectory => ({
  hasActiveMember: async ({ spaceId, email }) => {
    const rows = await db.orm
      .select({ userId: spaceMember.userId })
      .from(spaceMember)
      .innerJoin(identityUser, eq(identityUser.id, spaceMember.userId))
      .where(
        and(
          eq(spaceMember.spaceId, spaceId),
          isNull(spaceMember.closedAt),
          eq(sql`lower(${identityUser.email})`, email.toLowerCase()),
        ),
      );
    return rows.length > 0;
  },
});
