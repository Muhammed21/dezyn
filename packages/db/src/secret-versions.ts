import { Client } from "pg";

const VERSIONED = /^"\$ba\$(\d+)\$/;
const LEGACY = "legacy";
const VALID_AT = "(expires_at IS NULL OR expires_at > $1)";

const versionOf = (privateKey: string): string => VERSIONED.exec(privateKey)?.[1] ?? LEGACY;

const inOrder = (versions: ReadonlySet<string>): readonly string[] => [
  ...(versions.has(LEGACY) ? [LEGACY] : []),
  ...[...versions]
    .filter((version) => version !== LEGACY)
    .map(Number)
    .toSorted((left, right) => left - right)
    .map(String),
];

const onClient = async <T>(connectionString: string, run: (client: Client) => Promise<T>) => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

export const secretVersionsInUse = ({
  connectionString,
  now,
}: {
  readonly connectionString: string;
  readonly now: Date;
}): Promise<readonly string[]> =>
  onClient(connectionString, async (client) => {
    const { rows } = await client.query<{ private_key: string }>(
      `SELECT private_key FROM identity_jwks WHERE ${VALID_AT}`,
      [now],
    );
    return inOrder(new Set(rows.map(({ private_key }) => versionOf(private_key))));
  });

export const expireSigningKeys = ({
  connectionString,
  now,
}: {
  readonly connectionString: string;
  readonly now: Date;
}): Promise<number> =>
  onClient(connectionString, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE identity_jwks SET expires_at = $1 WHERE ${VALID_AT}`,
      [now],
    );
    return rowCount ?? 0;
  });
