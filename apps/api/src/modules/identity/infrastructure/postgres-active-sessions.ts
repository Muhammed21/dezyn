import { and, eq, gt } from "drizzle-orm";

import type { ActiveSessions } from "@repo/auth-verifier";
import { schema } from "@repo/db";

import type { PostgresDatabase } from "../../../platform/postgres-database.ts";

export const postgresActiveSessions = (db: PostgresDatabase): ActiveSessions => ({
  isActive: async (sid) => {
    const rows = await db.orm
      .select({ id: schema.identitySession.id })
      .from(schema.identitySession)
      .where(
        and(eq(schema.identitySession.id, sid), gt(schema.identitySession.expiresAt, new Date())),
      )
      .limit(1);
    return rows.length > 0;
  },
});
