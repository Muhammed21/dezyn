import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { schema } from "@repo/db";

import type { PostgresDatabase } from "../../../platform/postgres-database.ts";
import type { SpaceStore } from "../application/spaces.ts";

const { space, spaceMember } = schema;

const StoredMySpace = z.object({
  id: z.string(),
  name: z.string(),
  plan: z.enum(["free", "team"]),
  role: z.enum(["owner", "editor"]),
});

export const postgresSpaceStore = (db: PostgresDatabase): SpaceStore => ({
  createPersonal: ({ space: personal, owner, at }) =>
    db.orm.transaction(async (tx) => {
      await tx.insert(space).values({ ...personal, createdAt: at });
      await tx.insert(spaceMember).values({ ...owner, spaceId: personal.id, joinedAt: at });
    }),
  listOpenMembershipsOf: async (userId) => {
    const rows = await db.orm
      .select({ id: space.id, name: space.name, plan: space.plan, role: spaceMember.role })
      .from(spaceMember)
      .innerJoin(space, eq(space.id, spaceMember.spaceId))
      .where(and(eq(spaceMember.userId, userId), isNull(spaceMember.closedAt)))
      .orderBy(spaceMember.joinedAt);
    return rows.map((row) => StoredMySpace.parse(row));
  },
});
