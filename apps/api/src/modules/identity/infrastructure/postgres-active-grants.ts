import { and, eq, gt } from "drizzle-orm";

import type { ActiveGrants } from "@repo/auth-verifier";
import { schema } from "@repo/db";

import type { PostgresDatabase } from "../../../platform/postgres-database.ts";

const { identitySession: session, identityOAuthConsent: consent } = schema;

export const postgresActiveGrants = (db: PostgresDatabase): ActiveGrants => ({
  isActive: async ({ sid, userId, clientId }) => {
    const rows = await db.orm
      .select({ id: session.id })
      .from(session)
      .innerJoin(consent, and(eq(consent.userId, session.userId), eq(consent.clientId, clientId)))
      .where(
        and(eq(session.id, sid), eq(session.userId, userId), gt(session.expiresAt, new Date())),
      )
      .limit(1);
    return rows.length > 0;
  },
});
