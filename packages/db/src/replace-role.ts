import { Client } from "pg";

import { copyPrivilegesWith } from "./copy-role-privileges.ts";

const inTransaction = async (
  connectionString: string,
  run: (client: Client) => Promise<void>,
): Promise<void> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await run(client);
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
};

export const entrust = async ({
  ownerUrl,
  roleUrl,
  role,
  keeper,
}: {
  readonly ownerUrl: string;
  readonly roleUrl: string;
  readonly role: string;
  readonly keeper: string;
}): Promise<void> => {
  await inTransaction(ownerUrl, async (client) => {
    const held = client.escapeIdentifier(keeper);
    await client.query(`CREATE ROLE ${held} NOLOGIN`);
    await client.query(`GRANT ${held} TO ${client.escapeIdentifier(role)}, CURRENT_USER`);
  });
  await inTransaction(roleUrl, (client) =>
    client
      .query(
        `REASSIGN OWNED BY ${client.escapeIdentifier(role)} TO ${client.escapeIdentifier(keeper)}`,
      )
      .then(() => undefined),
  );
  await inTransaction(ownerUrl, (client) => copyPrivilegesWith(client, { from: role, to: keeper }));
};

export const restore = async ({
  ownerUrl,
  role,
  keeper,
  password,
  creates,
}: {
  readonly ownerUrl: string;
  readonly role: string;
  readonly keeper: string;
  readonly password: string;
  readonly creates: boolean;
}): Promise<void> =>
  inTransaction(ownerUrl, async (client) => {
    const restored = client.escapeIdentifier(role);
    const held = client.escapeIdentifier(keeper);
    await client.query(`CREATE ROLE ${restored} LOGIN PASSWORD ${client.escapeLiteral(password)}`);
    await client.query(`GRANT ${restored} TO CURRENT_USER`);
    await client.query(`REASSIGN OWNED BY ${held} TO ${restored}`);
    await copyPrivilegesWith(client, { from: keeper, to: role });
    if (creates) {
      await client.query(
        `DO $$ BEGIN EXECUTE format('GRANT CREATE ON DATABASE %I TO %I', current_database(), ${client.escapeLiteral(role)}); END $$`,
      );
      await client.query(`GRANT CREATE ON SCHEMA public TO ${restored}`);
    }
    await client.query(`DROP OWNED BY ${held}`);
    await client.query(`DROP ROLE ${held}`);
  });
