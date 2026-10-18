import { jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { project } from "./project.ts";

export const token = pgTable(
  "token",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id),
    name: text("name").notNull(),
    type: text("type").notNull(),
    description: text("description"),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [unique("token_project_id_name_key").on(table.projectId, table.name)],
);

export const tokenValue = pgTable(
  "token_value",
  {
    id: uuid("id").primaryKey(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => token.id),
    mode: text("mode"),
    value: jsonb("value").notNull(),
  },
  (table) => [
    unique("token_value_token_id_mode_key").on(table.tokenId, table.mode).nullsNotDistinct(),
  ],
);
