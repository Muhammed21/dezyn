import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { provisionRoles } from "./provision-roles.ts";

const adminUrl = (): URL => {
  const url = process.env.DATABASE_URL_ADMIN;
  if (url === undefined) {
    throw new Error("DATABASE_URL_ADMIN manquante : copier .env.example en .env");
  }
  return new URL(url);
};

const urlAs = (role: string, password: string): string => {
  const url = adminUrl();
  url.username = role;
  url.password = password;
  return url.toString();
};

const onClient = async <T>(connectionString: string, run: (client: Client) => Promise<T>) => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

const asAdmin = (sql: string) => onClient(adminUrl().toString(), (client) => client.query(sql));

const canLogIn = (role: string, password: string): Promise<boolean> =>
  onClient(urlAs(role, password), async () => true).catch(() => false);

const attributesOf = (role: string) =>
  onClient(adminUrl().toString(), async (client) => {
    const { rows } = await client.query(
      "SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls FROM pg_roles WHERE rolname = $1",
      [role],
    );
    return rows[0];
  });

type Cluster = {
  readonly ownerUrl: string;
  readonly role: (suffix: string) => string;
};

const withOwner = async (run: (cluster: Cluster) => Promise<void>): Promise<void> => {
  const prefix = `dezyn_test_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const owner = `${prefix}_owner`;
  const ownerPassword = randomUUID();
  await asAdmin(`CREATE ROLE ${owner} LOGIN CREATEROLE PASSWORD '${ownerPassword}'`);
  try {
    await run({ ownerUrl: urlAs(owner, ownerPassword), role: (suffix) => `${prefix}_${suffix}` });
  } finally {
    const { rows } = await asAdmin(
      `SELECT rolname FROM pg_roles WHERE rolname LIKE '${prefix}%' AND rolname <> '${owner}'`,
    );
    await Promise.all(rows.map(({ rolname }) => asAdmin(`DROP ROLE ${rolname}`)));
    await asAdmin(`DROP ROLE ${owner}`);
  }
};

describe("provisionRoles", () => {
  it("crée les rôles manquants, qui se connectent avec leur mot de passe et sans privilège", () =>
    withOwner(async ({ ownerUrl, role }) => {
      const app = role("app");

      expect(
        await provisionRoles({
          connectionString: ownerUrl,
          roles: [{ name: app, password: "mot-de-passe-app" }],
        }),
      ).toEqual({ kind: "provisioned" });

      expect(await canLogIn(app, "mot-de-passe-app")).toBe(true);
      expect(await attributesOf(app)).toEqual({
        rolsuper: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolbypassrls: false,
      });
    }));

  it("donne un nouveau mot de passe à un rôle qui existe déjà", () =>
    withOwner(async ({ ownerUrl, role }) => {
      const app = role("app");
      const migrator = role("migrator");
      await provisionRoles({
        connectionString: ownerUrl,
        roles: [
          { name: app, password: "ancien-app" },
          { name: migrator, password: "ancien-migrator" },
        ],
      });

      await provisionRoles({
        connectionString: ownerUrl,
        roles: [
          { name: app, password: "nouveau-app" },
          { name: migrator, password: "nouveau-migrator" },
        ],
      });

      expect(await canLogIn(app, "ancien-app")).toBe(false);
      expect(await canLogIn(app, "nouveau-app")).toBe(true);
      expect(await canLogIn(migrator, "nouveau-migrator")).toBe(true);
    }));

  it("ne crée aucun rôle quand l'un d'eux échoue", () =>
    withOwner(async ({ ownerUrl, role }) => {
      const app = role("app");
      const outOfReach = role("hors_de_portee");
      await asAdmin(`CREATE ROLE ${outOfReach} LOGIN PASSWORD 'ancien'`);

      await expect(
        provisionRoles({
          connectionString: ownerUrl,
          roles: [
            { name: app, password: "mot-de-passe-app" },
            { name: outOfReach, password: "nouveau" },
          ],
        }),
      ).rejects.toThrow("permission denied");

      expect(await canLogIn(app, "mot-de-passe-app")).toBe(false);
    }));

  it.each([
    ["membre de pg_write_all_data", (name: string) => `GRANT pg_write_all_data TO ${name}`],
    ["BYPASSRLS", (name: string) => `ALTER ROLE ${name} BYPASSRLS`],
    ["CREATEROLE", (name: string) => `ALTER ROLE ${name} CREATEROLE`],
    ["superutilisateur", (name: string) => `ALTER ROLE ${name} SUPERUSER`],
  ])("refuse un rôle %s, sans rien changer", (_privilege, grant) =>
    withOwner(async ({ ownerUrl, role }) => {
      const app = role("app");
      const migrator = role("migrator");
      await asAdmin(`CREATE ROLE ${app} LOGIN PASSWORD 'ancien-app'`);
      await asAdmin(grant(app));

      expect(
        await provisionRoles({
          connectionString: ownerUrl,
          roles: [
            { name: migrator, password: "nouveau-migrator" },
            { name: app, password: "nouveau-app" },
          ],
        }),
      ).toEqual({ kind: "privileged", roles: [app] });

      expect(await canLogIn(app, "ancien-app")).toBe(true);
      expect(await canLogIn(migrator, "nouveau-migrator")).toBe(false);
    }),
  );
});
