import { Client } from "pg";

export type ProvisionedRole = { readonly name: string; readonly password: string };

export type ProvisionOutcome =
  | { readonly kind: "provisioned" }
  | { readonly kind: "privileged"; readonly roles: readonly string[] };

export const privilegedRoles = async (
  client: Client,
  names: readonly string[],
): Promise<readonly string[]> => {
  const { rows } = await client.query<{ rolname: string }>(
    `SELECT rolname FROM pg_roles
     WHERE rolname = ANY($1)
       AND (rolsuper OR rolbypassrls OR rolcreaterole OR pg_has_role(oid, 'pg_write_all_data', 'MEMBER'))
     ORDER BY rolname`,
    [names],
  );
  return rows.map(({ rolname }) => rolname);
};

const provision = async (client: Client, { name, password }: ProvisionedRole): Promise<void> => {
  const role = client.escapeIdentifier(name);
  const secret = client.escapeLiteral(password);
  const { rowCount } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [name]);
  if (rowCount === 0) {
    await client.query(`CREATE ROLE ${role}`);
  }
  await client.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${secret}`);
};

export const provisionRoles = async ({
  connectionString,
  roles,
}: {
  readonly connectionString: string;
  readonly roles: readonly ProvisionedRole[];
}): Promise<ProvisionOutcome> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const privileged = await privilegedRoles(
      client,
      roles.map(({ name }) => name),
    );
    if (privileged.length > 0) {
      return { kind: "privileged", roles: privileged };
    }
    await client.query("BEGIN");
    await roles.reduce(
      (previous, role) => previous.then(() => provision(client, role)),
      Promise.resolve(),
    );
    await client.query("COMMIT");
    return { kind: "provisioned" };
  } finally {
    await client.end();
  }
};
