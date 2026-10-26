import { Client } from "pg";

import { privilegedRoles } from "./provision-roles.ts";

export type MissingRole = {
  readonly name: string;
  readonly password: string;
  readonly creates: boolean;
};

export type CreationOutcome =
  | { readonly kind: "created"; readonly roles: readonly string[] }
  | { readonly kind: "privileged"; readonly roles: readonly string[] }
  | { readonly kind: "unmigrated-grants"; readonly roles: readonly string[] };

const existingRoles = async (
  client: Client,
  names: readonly string[],
): Promise<readonly string[]> => {
  const { rows } = await client.query<{ rolname: string }>(
    "SELECT rolname FROM pg_roles WHERE rolname = ANY($1)",
    [names],
  );
  return rows.map(({ rolname }) => rolname);
};

const isMigrated = async (client: Client): Promise<boolean> => {
  const { rows: journal } = await client.query(
    "SELECT 1 FROM pg_class WHERE oid = to_regclass('drizzle.__drizzle_migrations')",
  );
  if (journal.length === 0) {
    return false;
  }
  const { rows } = await client.query("SELECT 1 FROM drizzle.__drizzle_migrations LIMIT 1");
  return rows.length > 0;
};

const create = async (client: Client, { name, password, creates }: MissingRole): Promise<void> => {
  const role = client.escapeIdentifier(name);
  await client.query(`CREATE ROLE ${role} LOGIN PASSWORD ${client.escapeLiteral(password)}`);
  if (creates) {
    await client.query(
      `DO $$ BEGIN EXECUTE format('GRANT CREATE ON DATABASE %I TO %I', current_database(), ${client.escapeLiteral(name)}); END $$`,
    );
    await client.query(`GRANT CREATE ON SCHEMA public TO ${role}`);
  }
};

export const createMissingRoles = async ({
  connectionString,
  roles,
}: {
  readonly connectionString: string;
  readonly roles: readonly MissingRole[];
}): Promise<CreationOutcome> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const names = roles.map(({ name }) => name);
    const privileged = await privilegedRoles(client, names);
    if (privileged.length > 0) {
      return { kind: "privileged", roles: privileged };
    }
    const existing = await existingRoles(client, names);
    const missing = roles.filter(({ name }) => !existing.includes(name));
    if (missing.length > 0 && (await isMigrated(client))) {
      return { kind: "unmigrated-grants", roles: missing.map(({ name }) => name) };
    }
    await client.query("BEGIN");
    await missing.reduce(
      (previous, role) => previous.then(() => create(client, role)),
      Promise.resolve(),
    );
    await client.query("COMMIT");
    return { kind: "created", roles: missing.map(({ name }) => name) };
  } finally {
    await client.end();
  }
};
