import { and, eq, isNull } from "drizzle-orm";

import type { PostgresTransaction } from "#db";
import { schema } from "@repo/db";

import type { StorageAlerts } from "../application/alert-storage.ts";
import { StoredSpace } from "./stored-rows.ts";

const { identityUser, project, space, spaceMember } = schema;

export const postgresStorageAlerts = (
  tx: Pick<PostgresTransaction, "select" | "update">,
): StorageAlerts => ({
  storageOf: async (spaceId) => {
    const [row] = await tx
      .select({ id: space.id, name: space.name, plan: space.plan })
      .from(space)
      .where(eq(space.id, spaceId));
    const projects = await tx
      .select({ name: project.name, storedBytes: project.storedBytes })
      .from(project)
      .where(eq(project.spaceId, spaceId));
    return { ...StoredSpace.parse(row), projects };
  },
  markAlerted: async ({ spaceId, at }) => {
    const marked = await tx
      .update(space)
      .set({ storageAlertedAt: at })
      .where(and(eq(space.id, spaceId), isNull(space.storageAlertedAt)))
      .returning({ id: space.id });
    return marked.length > 0;
  },
  openOwnerEmailsOf: async (spaceId) => {
    const rows = await tx
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
