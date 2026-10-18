import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { identityUser } from "./identity.ts";
import { project } from "./project.ts";
import { space } from "./space.ts";

export const historyAuthor = pgTable(
  "history_author",
  {
    id: uuid("id").primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id),
    userId: uuid("user_id").references(() => identityUser.id),
    deletedMemberNumber: integer("deleted_member_number"),
  },
  (table) => [unique("history_author_space_id_user_id_key").on(table.spaceId, table.userId)],
);

export const historyEntry = pgTable(
  "history_entry",
  {
    id: uuid("id").primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id),
    action: text("action").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => historyAuthor.id),
    clientId: text("client_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    correlationId: text("correlation_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("history_entry_project_id_occurred_at_id_idx").on(
      table.projectId,
      table.occurredAt,
      table.id,
    ),
  ],
);
