import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { copyRolePrivileges } from "./copy-role-privileges.ts";
import { migrate } from "./migrate.ts";
import { asAdmin, asAdminOn, onClient } from "./testing/clients.ts";
import { withThrowawayDatabase } from "./testing/throwaway-database.ts";

const withRoles = async (
  count: number,
  run: (names: readonly string[]) => Promise<void>,
): Promise<void> => {
  const prefix = `dezyn_test_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const names = Array.from({ length: count }, (_, index) => `${prefix}_${index}`);
  await Promise.all(names.map((name) => asAdmin(`CREATE ROLE ${name} NOLOGIN`)));
  try {
    await run(names);
  } finally {
    await Promise.all(names.map((name) => asAdmin(`DROP ROLE ${name}`)));
  }
};

const TABLE_PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
];
const COLUMN_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "REFERENCES"];

const privilegesOf = (connectionString: string, role: string) =>
  onClient(connectionString, async (client) => {
    const tables = await client.query<{ object: string; privilege: string; granted: boolean }>(
      `SELECT c.oid::regclass::text AS object, p.privilege, has_table_privilege($1, c.oid, p.privilege) AS granted
       FROM pg_class c CROSS JOIN unnest($2::text[]) AS p(privilege)
       WHERE c.relnamespace IN ('public'::regnamespace, 'drizzle'::regnamespace) AND c.relkind IN ('r', 'p')
       ORDER BY 1, 2`,
      [role, TABLE_PRIVILEGES],
    );
    const columns = await client.query<{ object: string; privilege: string; granted: boolean }>(
      `SELECT a.attrelid::regclass::text || '.' || a.attname AS object, p.privilege,
              has_column_privilege($1, a.attrelid, a.attnum, p.privilege) AS granted
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid CROSS JOIN unnest($2::text[]) AS p(privilege)
       WHERE c.relnamespace IN ('public'::regnamespace, 'drizzle'::regnamespace) AND c.relkind IN ('r', 'p')
         AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY 1, 2`,
      [role, COLUMN_PRIVILEGES],
    );
    return [...tables.rows, ...columns.rows];
  });

const granted = (connectionString: string, sql: string, params: readonly unknown[]) =>
  onClient(connectionString, async (client) => {
    const { rows } = await client.query<{ granted: boolean }>(`SELECT ${sql} AS granted`, [
      ...params,
    ]);
    return rows[0]?.granted;
  });

describe("copyRolePrivileges", () => {
  it("donne à un rôle les droits de app sur chaque table et chaque colonne", () =>
    withRoles(1, ([copy = ""]) =>
      withThrowawayDatabase(async ({ migratorUrl }) => {
        await migrate({ connectionString: migratorUrl });

        await copyRolePrivileges({ connectionString: migratorUrl, from: "app", to: copy });

        const expected = await privilegesOf(migratorUrl, "app");
        expect(await privilegesOf(migratorUrl, copy)).toEqual(expected);
        expect(expected.filter(({ granted }) => granted).length).toBeGreaterThan(0);
      }),
    ));

  it("garde l'historique en ajout seul pour la copie de app", () =>
    withRoles(1, ([copy = ""]) =>
      withThrowawayDatabase(async ({ migratorUrl }) => {
        await migrate({ connectionString: migratorUrl });

        await copyRolePrivileges({ connectionString: migratorUrl, from: "app", to: copy });

        const onHistory = (privilege: string) =>
          granted(migratorUrl, "has_table_privilege($1, 'history_entry', $2)", [copy, privilege]);
        expect(await onHistory("INSERT")).toBe(true);
        expect(await onHistory("UPDATE")).toBe(false);
        expect(await onHistory("DELETE")).toBe(false);
      }),
    ));

  it("copie les droits sur la base, les schémas et les séquences", () =>
    withRoles(2, ([from = "", to = ""]) =>
      withThrowawayDatabase(async ({ migratorUrl }) => {
        await onClient(migratorUrl, async (client) => {
          await client.query("CREATE SCHEMA reserve");
          await client.query("CREATE SEQUENCE reserve.compteur");
          await client.query(`GRANT CONNECT, CREATE ON DATABASE ${client.database} TO ${from}`);
          await client.query(`GRANT USAGE ON SCHEMA reserve TO ${from}`);
          await client.query(`GRANT USAGE, SELECT ON SEQUENCE reserve.compteur TO ${from}`);
        });

        await copyRolePrivileges({ connectionString: migratorUrl, from, to });

        expect(
          await granted(migratorUrl, "has_database_privilege($1, current_database(), 'CONNECT')", [
            to,
          ]),
        ).toBe(true);
        expect(
          await granted(migratorUrl, "has_database_privilege($1, current_database(), 'CREATE')", [
            to,
          ]),
        ).toBe(true);
        expect(
          await granted(migratorUrl, "has_schema_privilege($1, 'reserve', 'USAGE')", [to]),
        ).toBe(true);
        expect(
          await granted(migratorUrl, "has_schema_privilege($1, 'reserve', 'CREATE')", [to]),
        ).toBe(false);
        expect(
          await granted(migratorUrl, "has_sequence_privilege($1, 'reserve.compteur', 'USAGE')", [
            to,
          ]),
        ).toBe(true);
        expect(
          await granted(migratorUrl, "has_sequence_privilege($1, 'reserve.compteur', 'UPDATE')", [
            to,
          ]),
        ).toBe(false);
      }),
    ));

  it("ne copie pas l'appartenance à un rôle", () =>
    withRoles(2, ([from = "", to = ""]) =>
      withThrowawayDatabase(async ({ migratorUrl }) => {
        await asAdmin(`GRANT pg_write_all_data TO ${from}`);

        await copyRolePrivileges({ connectionString: migratorUrl, from, to });

        expect(
          await granted(migratorUrl, "pg_has_role($1, 'pg_write_all_data', 'MEMBER')", [to]),
        ).toBe(false);
      }),
    ));

  it("ne donne aucun droit quand l'un des GRANT échoue", () =>
    withRoles(2, ([from = "", to = ""]) =>
      withThrowawayDatabase(async ({ migratorUrl }) => {
        await migrate({ connectionString: migratorUrl });
        await onClient(migratorUrl, (client) =>
          client.query(`GRANT CONNECT ON DATABASE ${client.database} TO ${from}`),
        );
        await asAdminOn(migratorUrl, "CREATE TABLE hors_de_portee (id int)");
        await asAdminOn(migratorUrl, `GRANT SELECT ON hors_de_portee TO ${from}`);

        await expect(
          copyRolePrivileges({ connectionString: migratorUrl, from, to }),
        ).rejects.toThrow("permission denied");

        expect(
          await granted(migratorUrl, "has_database_privilege($1, current_database(), 'CONNECT')", [
            to,
          ]),
        ).toBe(false);
      }),
    ));
});
