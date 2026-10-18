import { and, eq, isNull } from "drizzle-orm";

import { schema } from "@repo/db";

import type { PostgresDatabase } from "../../../platform/postgres-database.ts";
import type { SpaceFinder } from "../application/read-space.ts";
import type { SpaceStore } from "../application/spaces.ts";
import { StoredMySpace, StoredSpace } from "./stored-rows.ts";

const { space, spaceMember } = schema;

export const postgresSpaceStore = (db: PostgresDatabase): SpaceStore & SpaceFinder => ({
  find: async (spaceId) => {
    const [row] = await db.orm
      .select({ id: space.id, name: space.name, plan: space.plan })
      .from(space)
      .where(eq(space.id, spaceId));
    return StoredSpace.parse(row);
  },
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
