import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { space } from "./space.ts";

export const project = pgTable(
  "project",
  {
    id: uuid("id").primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    storedBytes: bigint("stored_bytes", { mode: "number" }).notNull().default(0),
  },
  (table) => [index("project_space_id_idx").on(table.spaceId)],
);
