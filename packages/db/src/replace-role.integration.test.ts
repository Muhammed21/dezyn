import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { entrust, restore } from "./replace-role.ts";
import { asAdmin, onClient, urlOf } from "./testing/clients.ts";

type Cluster = {
  readonly ownerUrl: string;
  readonly adminUrl: string;
  readonly urlAs: (role: string, password: string) => string;
  readonly migrator: string;
  readonly app: string;
  readonly keeper: (role: string) => string;
  readonly asAdminHere: (sql: string) => Promise<unknown>;
  readonly deleteLikeNeon: (role: string) => Promise<void>;
};

const PASSWORD = "mot-de-passe-neon";

const withNeonLikeCluster = async (run: (cluster: Cluster) => Promise<void>): Promise<void> => {
  const prefix = `dezyn_test_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const owner = `${prefix}_owner`;
  const migrator = `${prefix}_migrator`;
  const app = `${prefix}_app`;
  const urlAs = (role: string, password: string): string => {
    const url = urlOf("DATABASE_URL_ADMIN");
    url.username = role;
    url.password = password;
    url.pathname = `/${prefix}`;
    return url.toString();
  };
  const adminUrl = urlOf("DATABASE_URL_ADMIN");
  adminUrl.pathname = `/${prefix}`;
  const asAdminHere = (sql: string) => onClient(adminUrl.toString(), (client) => client.query(sql));

  const neonSuperuser = `${prefix}_neon_superuser`;

  await asAdmin(`CREATE ROLE ${owner} LOGIN CREATEROLE PASSWORD '${PASSWORD}'`);
  await asAdmin(`CREATE ROLE ${neonSuperuser} NOLOGIN`);
  await asAdmin(`CREATE ROLE ${migrator} LOGIN PASSWORD '${PASSWORD}' IN ROLE ${neonSuperuser}`);
  await asAdmin(`CREATE ROLE ${app} LOGIN PASSWORD '${PASSWORD}'`);
  await asAdmin(`CREATE DATABASE ${prefix} OWNER ${owner}`);
  try {
    await asAdminHere(`REVOKE ALL ON DATABASE ${prefix} FROM PUBLIC`);
    await asAdminHere(`GRANT CONNECT ON DATABASE ${prefix} TO ${migrator}, ${app}`);
    await asAdminHere(`GRANT CREATE ON DATABASE ${prefix} TO ${neonSuperuser}`);
    await asAdminHere(`GRANT CREATE ON SCHEMA public TO ${neonSuperuser}`);
    await onClient(urlAs(migrator, PASSWORD), async (client) => {
      await client.query("CREATE SCHEMA journal");
      await client.query("CREATE TABLE journal.migrations (id int)");
      await client.query("INSERT INTO journal.migrations VALUES (1), (2)");
      await client.query("CREATE TABLE ledger (id int, note text)");
      await client.query("INSERT INTO ledger VALUES (1, 'un'), (2, 'deux'), (3, 'trois')");
      await client.query(`GRANT SELECT, INSERT ON ledger TO ${app}`);
      await client.query(`GRANT UPDATE (note) ON ledger TO ${app}`);
    });
    await run({
      ownerUrl: urlAs(owner, PASSWORD),
      adminUrl: adminUrl.toString(),
      urlAs,
      migrator,
      app,
      keeper: (role) => `${role}_keeper`,
      asAdminHere,
      deleteLikeNeon: async (role) => {
        await asAdminHere(`DROP OWNED BY ${role}`);
        await asAdmin(`DROP ROLE ${role}`);
      },
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

const LEDGER_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"];

const privilegesOn = (cluster: Cluster, role: string) =>
  onClient(cluster.ownerUrl, async (client) => {
    const table = await client.query<{ privilege: string; granted: boolean }>(
      "SELECT p.privilege, has_table_privilege($1, 'ledger', p.privilege) AS granted FROM unnest($2::text[]) AS p(privilege)",
      [role, LEDGER_PRIVILEGES],
    );
    const column = await client.query<{ granted: boolean }>(
      "SELECT has_column_privilege($1, 'ledger', 'note', 'UPDATE') AS granted",
      [role],
    );
    return { table: table.rows, noteUpdate: column.rows[0]?.granted };
  });

const ownersOf = (cluster: Cluster) =>
  onClient(cluster.ownerUrl, async (client) => {
    const { rows } = await client.query<{ object: string; owner: string }>(
      `SELECT c.oid::regclass::text AS object, pg_get_userbyid(c.relowner) AS owner
       FROM pg_class c WHERE c.oid IN ('ledger'::regclass, 'journal.migrations'::regclass)
       UNION ALL
       SELECT nspname, pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'journal'
       ORDER BY 1`,
    );
    return rows;
  });

const ledgerRows = (cluster: Cluster) =>
  onClient(cluster.adminUrl, async (client) => {
    const { rows } = await client.query<{ count: string }>("SELECT count(*) FROM ledger");
    return Number(rows[0]?.count);
  });

const roleExists = (role: string) =>
  asAdmin(`SELECT 1 FROM pg_roles WHERE rolname = '${role}'`).then(
    ({ rowCount }) => rowCount === 1,
  );

const replaceMigrator = async (cluster: Cluster, password: string): Promise<void> => {
  const keeper = cluster.keeper(cluster.migrator);
  await entrust({
    ownerUrl: cluster.ownerUrl,
    roleUrl: cluster.urlAs(cluster.migrator, PASSWORD),
    role: cluster.migrator,
    keeper,
  });
  await cluster.deleteLikeNeon(cluster.migrator);
  await restore({
    ownerUrl: cluster.ownerUrl,
    role: cluster.migrator,
    keeper,
    password,
    creates: true,
  });
};

describe("entrust puis restore", () => {
  it("rend à migrator recréé ses objets et leurs lignes, après une suppression qui détruit tout ce qu'il possède", () =>
    withNeonLikeCluster(async (cluster) => {
      await replaceMigrator(cluster, "nouveau-migrator");

      expect(await ownersOf(cluster)).toEqual([
        { object: "journal", owner: cluster.migrator },
        { object: "journal.migrations", owner: cluster.migrator },
        { object: "ledger", owner: cluster.migrator },
      ]);
      expect(await ledgerRows(cluster)).toBe(3);
      expect(await roleExists(cluster.keeper(cluster.migrator))).toBe(false);
    }));

  it("laisse migrator recréé se connecter avec son nouveau mot de passe, créer une table dans public et un schéma", () =>
    withNeonLikeCluster(async (cluster) => {
      await replaceMigrator(cluster, "nouveau-migrator");

      const created = await onClient(
        cluster.urlAs(cluster.migrator, "nouveau-migrator"),
        async (client) => {
          await client.query("CREATE TABLE apres (id int)");
          await client.query("CREATE SCHEMA ailleurs");
          const { rows } = await client.query<{ created: boolean }>(
            "SELECT to_regclass('apres') IS NOT NULL AND to_regnamespace('ailleurs') IS NOT NULL AS created",
          );
          return rows[0]?.created;
        },
      );

      expect(created).toBe(true);
    }));

  it("rend à app recréé exactement ses droits, colonne comprise, sans en ajouter", () =>
    withNeonLikeCluster(async (cluster) => {
      await replaceMigrator(cluster, "nouveau-migrator");
      const before = await privilegesOn(cluster, cluster.app);
      const keeper = cluster.keeper(cluster.app);

      await entrust({
        ownerUrl: cluster.ownerUrl,
        roleUrl: cluster.urlAs(cluster.app, PASSWORD),
        role: cluster.app,
        keeper,
      });
      await cluster.deleteLikeNeon(cluster.app);
      await restore({
        ownerUrl: cluster.ownerUrl,
        role: cluster.app,
        keeper,
        password: "nouveau-app",
        creates: false,
      });

      expect(await privilegesOn(cluster, cluster.app)).toEqual(before);
      expect(
        before.table.filter(({ granted }) => granted).map(({ privilege }) => privilege),
      ).toEqual(["SELECT", "INSERT"]);
      expect(before.noteUpdate).toBe(true);
      await onClient(cluster.urlAs(cluster.app, "nouveau-app"), (client) =>
        client.query("INSERT INTO ledger VALUES (4, 'quatre')"),
      );
      await expect(
        onClient(cluster.urlAs(cluster.app, "nouveau-app"), (client) =>
          client.query("CREATE TABLE interdite (id int)"),
        ),
      ).rejects.toThrow("permission denied");
      expect(await roleExists(keeper)).toBe(false);
    }));

  it("laisse app garder tous ses droits quand entrust échoue", () =>
    withNeonLikeCluster(async (cluster) => {
      await replaceMigrator(cluster, "nouveau-migrator");
      const before = await privilegesOn(cluster, cluster.app);
      await cluster.asAdminHere("CREATE TABLE hors_de_portee (id int)");
      await cluster.asAdminHere(`GRANT SELECT ON hors_de_portee TO ${cluster.app}`);

      await expect(
        entrust({
          ownerUrl: cluster.ownerUrl,
          roleUrl: cluster.urlAs(cluster.app, PASSWORD),
          role: cluster.app,
          keeper: cluster.keeper(cluster.app),
        }),
      ).rejects.toThrow("permission denied");

      expect(await privilegesOn(cluster, cluster.app)).toEqual(before);
    }));

  it("laisse le dépositaire tout garder, et ne crée pas le rôle, quand il lui reste un droit impossible à rendre", () =>
    withNeonLikeCluster(async (cluster) => {
      const keeper = cluster.keeper(cluster.migrator);
      await entrust({
        ownerUrl: cluster.ownerUrl,
        roleUrl: cluster.urlAs(cluster.migrator, PASSWORD),
        role: cluster.migrator,
        keeper,
      });
      await cluster.deleteLikeNeon(cluster.migrator);
      await cluster.asAdminHere("CREATE TABLE hors_de_portee (id int)");
      await cluster.asAdminHere(`GRANT SELECT ON hors_de_portee TO ${keeper}`);

      await expect(
        restore({
          ownerUrl: cluster.ownerUrl,
          role: cluster.migrator,
          keeper,
          password: "nouveau-migrator",
          creates: true,
        }),
      ).rejects.toThrow("cannot be dropped");

      expect(await roleExists(cluster.migrator)).toBe(false);
      expect(await ownersOf(cluster)).toEqual([
        { object: "journal", owner: keeper },
        { object: "journal.migrations", owner: keeper },
        { object: "ledger", owner: keeper },
      ]);
    }));
});
