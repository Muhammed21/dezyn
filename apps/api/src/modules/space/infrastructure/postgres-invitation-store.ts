import type { PostgresDatabase } from "#db";
import { schema } from "@repo/db";

import type { InvitationStore } from "../application/invite-member.ts";

export const postgresInvitationStore = (db: PostgresDatabase): InvitationStore => ({
  create: async (invitation) => {
    await db.orm.insert(schema.spaceInvitation).values(invitation);
  },
});
