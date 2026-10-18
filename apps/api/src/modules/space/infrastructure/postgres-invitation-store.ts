import { schema } from "@repo/db";

import type { PostgresDatabase } from "../../../platform/postgres-database.ts";
import type { InvitationStore } from "../application/invite-member.ts";

export const postgresInvitationStore = (db: PostgresDatabase): InvitationStore => ({
  create: async (invitation) => {
    await db.orm.insert(schema.spaceInvitation).values(invitation);
  },
});
