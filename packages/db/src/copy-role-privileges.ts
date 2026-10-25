import { Client } from "pg";

const GRANTS = `
  SELECT format('GRANT %s ON DATABASE %I TO %I', a.privilege_type, d.datname, $2::text) AS statement
  FROM pg_database d, aclexplode(d.datacl) a
  WHERE d.datname = current_database() AND a.grantee = to_regrole($1::text)
  UNION ALL
  SELECT format('GRANT %s ON SCHEMA %I TO %I', a.privilege_type, n.nspname, $2::text)
  FROM pg_namespace n, aclexplode(n.nspacl) a
  WHERE a.grantee = to_regrole($1::text)
  UNION ALL
  SELECT format('GRANT %s ON TABLE %s TO %I', a.privilege_type, c.oid::regclass, $2::text)
  FROM pg_class c, aclexplode(c.relacl) a
  WHERE a.grantee = to_regrole($1::text)
  UNION ALL
  SELECT format('GRANT %s (%I) ON TABLE %s TO %I', a.privilege_type, t.attname, t.attrelid::regclass, $2::text)
  FROM pg_attribute t, aclexplode(t.attacl) a
  WHERE a.grantee = to_regrole($1::text)
`;

export const copyPrivilegesWith = async (
  client: Client,
  { from, to }: { readonly from: string; readonly to: string },
): Promise<void> => {
  const { rows } = await client.query<{ statement: string }>(GRANTS, [from, to]);
  await rows.reduce(
    (previous, { statement }) => previous.then(() => client.query(statement)).then(() => undefined),
    Promise.resolve(),
  );
};

export const copyRolePrivileges = async ({
  connectionString,
  from,
  to,
}: {
  readonly connectionString: string;
  readonly from: string;
  readonly to: string;
}): Promise<void> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await copyPrivilegesWith(client, { from, to });
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
};
