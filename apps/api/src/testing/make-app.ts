import { createApp } from "../create-app.ts";
import type { Auth } from "../modules/identity/application/auth.ts";
import type { Database } from "../platform/database.ts";
import type { LogRecord } from "../platform/logging.ts";

export const makeDatabase = (overrides: Partial<Database> = {}): Database => ({
  ping: () => Promise.resolve(),
  ...overrides,
});

export const makeAuth = (overrides: Partial<Auth> = {}): Auth => ({
  handle: () => Promise.resolve(new Response(null, { status: 404 })),
  ...overrides,
});

export const makeApp = ({
  db = makeDatabase(),
  auth = makeAuth(),
}: { readonly db?: Database; readonly auth?: Auth } = {}) => {
  const records: LogRecord[] = [];
  const app = createApp({ db, auth, log: (record) => records.push(record) });
  return { app, records };
};
