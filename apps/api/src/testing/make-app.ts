import { err } from "@repo/result";

import { createApp } from "../create-app.ts";
import type { Auth } from "../modules/identity/application/auth.ts";
import type { SpaceUseCases } from "../modules/space/application/spaces.ts";
import type { Database } from "../platform/database.ts";
import type { LogRecord } from "../platform/logging.ts";

export const makeDatabase = (overrides: Partial<Database> = {}): Database => ({
  ping: () => Promise.resolve(),
  ...overrides,
});

export const makeAuth = (overrides: Partial<Auth> = {}): Auth => ({
  baseURL: "http://127.0.0.1:3000",
  handle: () => Promise.resolve(new Response(null, { status: 404 })),
  authorizationServerMetadata: () => Promise.resolve(new Response(null, { status: 404 })),
  protectedResourceMetadata: () => Promise.resolve(new Response(null, { status: 404 })),
  verifyAccessToken: () => Promise.resolve(err("invalid_token")),
  ...overrides,
});

export const makeSpaces = (): SpaceUseCases => ({
  listMySpaces: () => Promise.resolve([]),
  readSpace: () => Promise.resolve(err("not_found")),
});

export const makeApp = ({
  db = makeDatabase(),
  auth = makeAuth(),
}: { readonly db?: Database; readonly auth?: Auth } = {}) => {
  const records: LogRecord[] = [];
  const app = createApp({
    db,
    auth,
    log: (record) => records.push(record),
    spaces: makeSpaces(),
  });
  return { app, records };
};
