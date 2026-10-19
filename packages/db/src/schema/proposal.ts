import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { identityUser } from "./identity.ts";
import { project } from "./project.ts";

export const proposalBatch = pgTable(
  "proposal_batch",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => identityUser.id),
    clientId: text("client_id").notNull(),
    intent: text("intent"),
    state: text("state").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    lastWrittenAt: timestamp("last_written_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("proposal_batch_open_key")
      .on(table.projectId, table.userId, table.clientId)
      .where(sql`${table.state} = 'open'`),
  ],
);

export const proposal = pgTable(
  "proposal",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => proposalBatch.id),
    tokenName: text("token_name").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("proposal_pending_key")
      .on(table.projectId, table.tokenName)
      .where(sql`${table.status} = 'proposed'`),
  ],
);
