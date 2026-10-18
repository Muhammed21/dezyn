import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { identityUser } from "./identity.ts";

const at = (name: string) => timestamp(name, { withTimezone: true });

export const space = pgTable("space", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").notNull(),
  createdAt: at("created_at").notNull(),
});

export const spaceMember = pgTable(
  "space_member",
  {
    id: uuid("id").primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => identityUser.id),
    role: text("role").notNull(),
    joinedAt: at("joined_at").notNull(),
    closedAt: at("closed_at"),
    closedReason: text("closed_reason"),
  },
  (table) => [
    uniqueIndex("space_member_open_space_id_user_id_idx")
      .on(table.spaceId, table.userId)
      .where(sql`${table.closedAt} IS NULL`),
    index("space_member_open_user_id_idx")
      .on(table.userId)
      .where(sql`${table.closedAt} IS NULL`),
  ],
);
