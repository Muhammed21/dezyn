import { sql } from "drizzle-orm";
import {
  check,
  type AnyPgColumn,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { identityUser } from "./identity.ts";
import { project } from "./project.ts";
import { proposal } from "./proposal.ts";

export const modifier = pgTable(
  "modifier",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id),
    name: text("name").notNull(),
  },
  (table) => [unique("modifier_project_id_key").on(table.projectId)],
);

export const mode = pgTable(
  "mode",
  {
    id: uuid("id").primaryKey(),
    modifierId: uuid("modifier_id")
      .notNull()
      .references(() => modifier.id),
    name: text("name").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [unique("mode_modifier_id_name_key").on(table.modifierId, table.name)],
);

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
    modeId: uuid("mode_id").references(() => mode.id),
    value: jsonb("value"),
    referencedTokenId: uuid("referenced_token_id").references((): AnyPgColumn => token.id),
  },
  (table) => [
    unique("token_value_token_id_mode_id_key").on(table.tokenId, table.modeId).nullsNotDistinct(),
    check(
      "token_value_value_or_reference_check",
      sql`(${table.value} IS NULL) <> (${table.referencedTokenId} IS NULL)`,
    ),
  ],
);

export const tokenFigmaState = pgTable("token_figma_state", {
  tokenId: uuid("token_id")
    .primaryKey()
    .references(() => token.id),
  state: text("state").notNull(),
  figmaVariables: jsonb("figma_variables"),
  rejectedValue: jsonb("rejected_value"),
  declaredAt: timestamp("declared_at", { withTimezone: true }).notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => identityUser.id),
  clientId: text("client_id").notNull(),
  proposalId: uuid("proposal_id").references(() => proposal.id),
});
