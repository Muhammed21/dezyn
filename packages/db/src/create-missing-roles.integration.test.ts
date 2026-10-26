import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createMissingRoles } from "./create-missing-roles.ts";
import { migrate } from "./migrate.ts";
import { asAdmin, onClient, urlOf } from "./testing/clients.ts";

type Cluster = {
  readonly ownerUrl: string;
  readonly role: (suffix: string) => string;
  readonly urlAs: (role: string, password: string) => string;
};

const OWNER_PASSWORD = "mot-de-passe-proprietaire";

const withOwnedDatabase = async (run: (cluster: Cluster) => Promise<void>): Promise<void> => {
  const prefix = `dezyn_test_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const owner = `${prefix}_owner`;
  const urlAs = (role: string, password: string): string => {
    const url = urlOf("DATABASE_URL_ADMIN");
    url.username = role;
    url.password = password;
    url.pathname = `/${prefix}`;
    return url.toString();
  };
  await asAdmin(`CREATE ROLE ${owner} LOGIN CREATEROLE PASSWORD '${OWNER_PASSWORD}'`);
  await asAdmin(`CREATE DATABASE ${prefix} OWNER ${owner}`);
  try {
    await run({
      ownerUrl: urlAs(owner, OWNER_PASSWORD),
      role: (suffix) => `${prefix}_${suffix}`,
      urlAs,
    });
  } finally {
    await asAdmin(`DROP DATABASE ${prefix} WITH (FORCE)`);
    const { rows } = await asAdmin(
      `SELECT rolname FROM pg_roles WHERE rolname LIKE '${prefix}%' AND rolname <> '${owner}'`,
    );
    await [...rows.map(({ rolname }) => rolname), owner].reduce(
      (previous, role) => previous.then(() => asAdmin(`DROP ROLE ${role}`)),
      Promise.resolve<unknown>(undefined),
    );
  }
};

const canLogIn = (url: string): Promise<boolean> =>
  onClient(url, async () => true).catch(() => false);

const attributesOf = (role: string) =>
  onClient(urlOf("DATABASE_URL_ADMIN").toString(), async (client) => {
    const { rows } = await client.query(
      "SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls FROM pg_roles WHERE rolname = $1",
      [role],
    );
    return rows[0];
  });

const roleExists = (role: string) =>
  asAdmin(`SELECT 1 FROM pg_roles WHERE rolname = '${role}'`).then(
    ({ rowCount }) => rowCount === 1,
  );

const migrationJournalOf = (cluster: Cluster, rows: number) =>
  onClient(cluster.ownerUrl, async (client) => {
    await client.query("CREATE SCHEMA drizzle");
    await client.query(
      "CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)",
    );
    await Promise.all(
      Array.from({ length: rows }, (_, index) =>
        client.query("INSERT INTO drizzle.__drizzle_migrations (hash) VALUES ($1)", [`h${index}`]),
      ),
    );
  });

describe("createMissingRoles", () => {
  it("crée les rôles manquants, qui se connectent avec leur mot de passe et sans privilège", () =>
    withOwnedDatabase(async (cluster) => {
      const app = cluster.role("app");
      const maintainer = cluster.role("maintainer");

      expect(
        await createMissingRoles({
          connectionString: cluster.ownerUrl,
          roles: [
            { name: app, password: "mot-de-passe-app", creates: false },
            { name: maintainer, password: "mot-de-passe-maintainer", creates: false },
          ],
        }),
      ).toEqual({ kind: "created", roles: [app, maintainer] });

      expect(await canLogIn(cluster.urlAs(app, "mot-de-passe-app"))).toBe(true);
      expect(await canLogIn(cluster.urlAs(maintainer, "mot-de-passe-maintainer"))).toBe(true);
      expect(await attributesOf(app)).toEqual({
        rolsuper: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolbypassrls: false,
      });
    }));

  it("laisse intact le mot de passe d'un rôle qui existe déjà, et ne crée que les autres", () =>
    withOwnedDatabase(async (cluster) => {
      const app = cluster.role("app");
      const migrator = cluster.role("migrator");
      await asAdmin(`CREATE ROLE ${app} LOGIN PASSWORD 'ancien-app'`);

      expect(
        await createMissingRoles({
          connectionString: cluster.ownerUrl,
          roles: [
            { name: migrator, password: "nouveau-migrator", creates: true },
            { name: app, password: "nouveau-app", creates: false },
          ],
        }),
      ).toEqual({ kind: "created", roles: [migrator] });

      expect(await canLogIn(cluster.urlAs(app, "ancien-app"))).toBe(true);
      expect(await canLogIn(cluster.urlAs(app, "nouveau-app"))).toBe(false);
      expect(await canLogIn(cluster.urlAs(migrator, "nouveau-migrator"))).toBe(true);
    }));

  it("ne crée rien quand tous les rôles existent", () =>
    withOwnedDatabase(async (cluster) => {
      const app = cluster.role("app");
      await asAdmin(`CREATE ROLE ${app} LOGIN PASSWORD 'ancien-app'`);

      expect(
        await createMissingRoles({
          connectionString: cluster.ownerUrl,
          roles: [{ name: app, password: "nouveau-app", creates: false }],
        }),
      ).toEqual({ kind: "created", roles: [] });
    }));

  it("refuse un rôle privilégié, sans rien créer", () =>
    withOwnedDatabase(async (cluster) => {
      const app = cluster.role("app");
      const migrator = cluster.role("migrator");
      await asAdmin(`CREATE ROLE ${app} LOGIN PASSWORD 'ancien-app'`);
      await asAdmin(`GRANT pg_write_all_data TO ${app}`);

      expect(
        await createMissingRoles({
          connectionString: cluster.ownerUrl,
          roles: [
            { name: migrator, password: "nouveau-migrator", creates: true },
            { name: app, password: "nouveau-app", creates: false },
          ],
        }),
      ).toEqual({ kind: "privileged", roles: [app] });

      expect(await roleExists(migrator)).toBe(false);
    }));

  it("refuse un rôle manquant sur une base déjà migrée, dont les droits ne reviendraient pas", () =>
    withOwnedDatabase(async (cluster) => {
      const app = cluster.role("app");
      const migrator = cluster.role("migrator");
      await asAdmin(`CREATE ROLE ${migrator} LOGIN PASSWORD 'ancien-migrator'`);
      await migrationJournalOf(cluster, 1);

      expect(
        await createMissingRoles({
          connectionString: cluster.ownerUrl,
          roles: [
            { name: migrator, password: "nouveau-migrator", creates: true },
            { name: app, password: "nouveau-app", creates: false },
          ],
        }),
      ).toEqual({ kind: "unmigrated-grants", roles: [app] });

      expect(await roleExists(app)).toBe(false);
    }));

  it("ne crée rien, sans refuser, sur une base migrée dont tous les rôles existent", () =>
    withOwnedDatabase(async (cluster) => {
      const app = cluster.role("app");
      await asAdmin(`CREATE ROLE ${app} LOGIN PASSWORD 'ancien-app'`);
      await migrationJournalOf(cluster, 1);

      expect(
        await createMissingRoles({
          connectionString: cluster.ownerUrl,
          roles: [{ name: app, password: "nouveau-app", creates: false }],
        }),
      ).toEqual({ kind: "created", roles: [] });
    }));

  it("crée les rôles manquants quand le journal des migrations existe mais est vide", () =>
    withOwnedDatabase(async (cluster) => {
      const app = cluster.role("app");
      await migrationJournalOf(cluster, 0);

      expect(
        await createMissingRoles({
          connectionString: cluster.ownerUrl,
          roles: [{ name: app, password: "nouveau-app", creates: false }],
        }),
      ).toEqual({ kind: "created", roles: [app] });
    }));

  it("donne à un rôle qui crée de quoi migrer une base vide qu'il ne possède pas", () =>
    withOwnedDatabase(async (cluster) => {
      const migrator = cluster.role("migrator");

      await createMissingRoles({
        connectionString: cluster.ownerUrl,
        roles: [{ name: migrator, password: "nouveau-migrator", creates: true }],
      });
      await migrate({ connectionString: cluster.urlAs(migrator, "nouveau-migrator") });

      const applied = await onClient(
        cluster.urlAs(migrator, "nouveau-migrator"),
        async (client) => {
          const { rows } = await client.query<{ count: string }>(
            "SELECT count(*) FROM drizzle.__drizzle_migrations",
          );
          return Number(rows[0]?.count);
        },
      );
      expect(applied).toBeGreaterThan(0);
    }));

  it("ne donne pas CREATE à un rôle qui ne crée pas", () =>
    withOwnedDatabase(async (cluster) => {
      const app = cluster.role("app");

      await createMissingRoles({
        connectionString: cluster.ownerUrl,
        roles: [{ name: app, password: "nouveau-app", creates: false }],
      });

      const creates = await onClient(cluster.ownerUrl, async (client) => {
        const { rows } = await client.query<{ database: boolean; schema: boolean }>(
          `SELECT has_database_privilege($1, current_database(), 'CREATE') AS database,
                  has_schema_privilege($1, 'public', 'CREATE') AS schema`,
          [app],
        );
        return rows[0];
      });
      expect(creates).toEqual({ database: false, schema: false });
    }));

  it("ne crée aucun rôle quand l'une des créations échoue", () =>
    withOwnedDatabase(async (cluster) => {
      const app = cluster.role("app");

      await expect(
        createMissingRoles({
          connectionString: cluster.ownerUrl,
          roles: [
            { name: app, password: "nouveau-app", creates: false },
            { name: "pg_interdit", password: "nouveau", creates: false },
          ],
        }),
      ).rejects.toThrow("reserved");

      expect(await roleExists(app)).toBe(false);
    }));
});
