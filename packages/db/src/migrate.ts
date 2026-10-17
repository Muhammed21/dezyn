import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as applyMigrations } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

import { assertRolesProvisioned } from "./provisioned-roles.ts";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

export const migrate = async ({
  connectionString,
}: {
  readonly connectionString: string;
}): Promise<void> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await assertRolesProvisioned({
      listRoles: async () => {
        const { rows } = await client.query<{ rolname: string }>("SELECT rolname FROM pg_roles");
        return rows.map((row) => row.rolname);
      },
    });
    await applyMigrations(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
};
