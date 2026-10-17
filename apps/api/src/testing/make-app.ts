import { createApp } from "../create-app.ts";
import type { Database } from "../platform/database.ts";
import type { LogRecord } from "../platform/logging.ts";

export const makeDatabase = (overrides: Partial<Database> = {}): Database => ({
  ping: () => Promise.resolve(),
  ...overrides,
});

export const makeApp = ({ db = makeDatabase() }: { readonly db?: Database } = {}) => {
  const records: LogRecord[] = [];
  const app = createApp({ db, log: (record) => records.push(record) });
  return { app, records };
};
