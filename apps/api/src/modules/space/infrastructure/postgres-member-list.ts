import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { PostgresDatabase } from "#db";
import { schema } from "@repo/db";

import type { MemberList } from "../application/list-members.ts";
import { StoredMember } from "./stored-rows.ts";

const { identityUser, spaceMember } = schema;

const arrivedAt = sql`(
  select min(earlier.joined_at) from space_member earlier
  where earlier.space_id = ${spaceMember.spaceId}
    and earlier.user_id = ${spaceMember.userId}
    and earlier.joined_at > coalesce(
      (
        select max(departure.closed_at) from space_member departure
        where departure.space_id = ${spaceMember.spaceId}
          and departure.user_id = ${spaceMember.userId}
          and departure.closed_reason <> 'role_changed'
      ),
      '-infinity'
    )
)`;

export const postgresMemberList = (db: PostgresDatabase): MemberList => ({
  activeMembers: async (spaceId) => {
    const rows = await db.orm
      .select({
        userId: spaceMember.userId,
        name: identityUser.name,
        email: identityUser.email,
        role: spaceMember.role,
      })
      .from(spaceMember)
      .innerJoin(identityUser, eq(identityUser.id, spaceMember.userId))
      .where(and(eq(spaceMember.spaceId, spaceId), isNull(spaceMember.closedAt)))
      .orderBy(asc(arrivedAt), asc(spaceMember.userId));
    return rows.map((row) => StoredMember.parse(row));
  },
});
