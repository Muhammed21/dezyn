import { getAuthTables } from "better-auth/db";
import { type Column, getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { IDENTITY_SCHEMA, identityAuthOptions } from "./better-auth.ts";

const DRIZZLE_TYPE: ReadonlyMap<string, string> = new Map([
  ["string", "string"],
  ["date", "date"],
  ["boolean", "boolean"],
  ["number", "number"],
  ["string[]", "array"],
  ["json", "json"],
]);

const tables = Object.entries(
  getAuthTables(
    identityAuthOptions({ baseURL: "http://127.0.0.1:3000", trustedIpHeader: "x-forwarded-for" }),
  ),
);

const COLUMNS: ReadonlyMap<string, Readonly<Record<string, Column>>> = new Map(
  Object.entries(IDENTITY_SCHEMA).map(([model, table]) => [model, getTableColumns(table)]),
);

describe("schéma Drizzle des tables d'identité", () => {
  it("couvre chaque table que better-auth déclare, et rien de plus", () => {
    expect(Object.keys(IDENTITY_SCHEMA).toSorted()).toEqual(
      tables.map(([model]) => model).toSorted(),
    );
  });

  it.each(tables)(
    "la table %s a chaque champ de better-auth, avec son type et son caractère obligatoire",
    (model, table) => {
      const columns = COLUMNS.get(model) ?? {};

      const actual = Object.entries(table.fields).map(([field, definition]) => {
        const column = columns[definition.fieldName ?? field];
        return { field, type: column?.dataType, required: column?.notNull };
      });
      const expected = Object.entries(table.fields).map(([field, definition]) => ({
        field,
        type: typeof definition.type === "string" ? DRIZZLE_TYPE.get(definition.type) : undefined,
        required: definition.required !== false,
      }));

      expect(actual).toEqual(expected);
      expect(columns["id"]).toMatchObject({ dataType: "string", primary: true });
    },
  );
});
