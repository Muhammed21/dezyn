import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { identityUser } from "./identity.ts";
import { project } from "./project.ts";

export const propositionLot = pgTable(
  "proposition_lot",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => identityUser.id),
    clientId: text("client_id").notNull(),
    intention: text("intention"),
    state: text("state").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    lastWrittenAt: timestamp("last_written_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("proposition_lot_open_key")
      .on(table.projectId, table.userId, table.clientId)
      .where(sql`${table.state} = 'open'`),
  ],
);

export const proposition = pgTable("proposition", {
  id: uuid("id").primaryKey(),
  lotId: uuid("lot_id")
    .notNull()
    .references(() => propositionLot.id),
  tokenName: text("token_name").notNull(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
