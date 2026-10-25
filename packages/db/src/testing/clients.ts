import { Client } from "pg";

export const urlOf = (variable: string): URL => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return new URL(url);
};

export const onClient = async <T>(
  connectionString: string,
  run: (client: Client) => Promise<T>,
): Promise<T> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

export const asAdmin = (sql: string) =>
  onClient(urlOf("DATABASE_URL_ADMIN").toString(), (client) => client.query(sql));
