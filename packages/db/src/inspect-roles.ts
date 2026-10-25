import { Client } from "pg";

import { privilegedRoles } from "./provision-roles.ts";

export type RolesReport = {
  readonly privileged: readonly string[];
  readonly foreign: readonly string[];
  readonly history: readonly string[];
  readonly rows: Readonly<Record<string, number>>;
};

const IN_SCHEMAS = `n.nspname IN ('public', 'drizzle')`;

const foreignObjects = async (client: Client): Promise<readonly string[]> => {
  const { rows } = await client.query<{ name: string }>(
    `SELECT n.nspname || '.' || c.relname AS name
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE ${IN_SCHEMAS} AND c.relkind IN ('r', 'p', 'S', 'v', 'm') AND c.relowner <> 'migrator'::regrole
     ORDER BY 1`,
  );
  return rows.map(({ name }) => name);
};

const historyPrivileges = async (client: Client): Promise<readonly string[]> => {
  const { rows } = await client.query<{ privilege: string }>(
    `SELECT p.privilege FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) WITH ORDINALITY AS p(privilege, position)
     WHERE has_table_privilege('app', 'public.history_entry', p.privilege)
     ORDER BY p.position`,
  );
  return rows.map(({ privilege }) => privilege);
};

const rowCounts = async (client: Client): Promise<RolesReport["rows"]> => {
  const { rows } = await client.query<{ name: string; count: number }>(
    `SELECT n.nspname || '.' || c.relname AS name,
            (xpath('/row/count/text()', query_to_xml(format('SELECT count(*) FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::int AS count
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE ${IN_SCHEMAS} AND c.relkind IN ('r', 'p')`,
  );
  return Object.fromEntries(rows.map(({ name, count }) => [name, count]));
};

export const inspectRoles = async ({
  connectionString,
  roles,
}: {
  readonly connectionString: string;
  readonly roles: readonly string[];
}): Promise<RolesReport> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return {
      privileged: await privilegedRoles(client, roles),
      foreign: await foreignObjects(client),
      history: await historyPrivileges(client),
      rows: await rowCounts(client),
    };
  } finally {
    await client.end();
  }
};
