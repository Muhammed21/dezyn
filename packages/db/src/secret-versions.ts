import { Client } from "pg";

const VERSIONED = /^"\$ba\$(\d+)\$/;
const LEGACY = "legacy";

const versionOf = (privateKey: string): string => VERSIONED.exec(privateKey)?.[1] ?? LEGACY;

const inOrder = (versions: ReadonlySet<string>): readonly string[] => [
  ...(versions.has(LEGACY) ? [LEGACY] : []),
  ...[...versions]
    .filter((version) => version !== LEGACY)
    .map(Number)
    .toSorted((left, right) => left - right)
    .map(String),
];

export const secretVersionsInUse = async ({
  connectionString,
  now,
}: {
  readonly connectionString: string;
  readonly now: Date;
}): Promise<readonly string[]> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ private_key: string }>(
      "SELECT private_key FROM identity_jwks WHERE expires_at IS NULL OR expires_at > $1",
      [now],
    );
    return inOrder(new Set(rows.map(({ private_key }) => versionOf(private_key))));
  } finally {
    await client.end();
  }
};
