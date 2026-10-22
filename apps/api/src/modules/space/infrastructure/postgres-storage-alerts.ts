import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { PostgresDatabase } from "#db";
import { schema } from "@repo/db";

import type { StorageAlerts } from "../application/alert-storage.ts";
import { StoredSpace } from "./stored-rows.ts";

const { identityUser, project, space, spaceMember } = schema;

const StoredSpaceStorage = StoredSpace.extend({ storedBytes: z.coerce.number() });

export const postgresStorageAlerts = (db: PostgresDatabase): StorageAlerts => ({
  storageOf: async (spaceId) => {
    const [row] = await db.orm
      .select({
        id: space.id,
        name: space.name,
        plan: space.plan,
        storedBytes: sql<string>`coalesce(sum(${project.storedBytes}), 0)`,
      })
      .from(space)
      .leftJoin(project, eq(project.spaceId, space.id))
      .where(eq(space.id, spaceId))
      .groupBy(space.id);
    return StoredSpaceStorage.parse(row);
  },
  markAlerted: async ({ spaceId, at }) => {
    const marked = await db.orm
      .update(space)
      .set({ storageAlertedAt: at })
      .where(and(eq(space.id, spaceId), isNull(space.storageAlertedAt)))
      .returning({ id: space.id });
    return marked.length > 0;
  },
  openOwnerEmailsOf: async (spaceId) => {
    const rows = await db.orm
      .select({ email: identityUser.email })
      .from(spaceMember)
      .innerJoin(identityUser, eq(identityUser.id, spaceMember.userId))
      .where(
        and(
          eq(spaceMember.spaceId, spaceId),
          eq(spaceMember.role, "owner"),
          isNull(spaceMember.closedAt),
        ),
      );
    return rows.map(({ email }) => email);
  },
});
