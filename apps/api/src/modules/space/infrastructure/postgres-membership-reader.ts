import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { schema } from "@repo/db";

import type { PostgresDatabase } from "../../../platform/postgres-database.ts";
import type { MembershipReader } from "../application/membership-reader.ts";

const { spaceMember } = schema;

const StoredMembership = z.object({
  spaceId: z.string(),
  userId: z.string(),
  role: z.enum(["owner", "editor"]),
});

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
