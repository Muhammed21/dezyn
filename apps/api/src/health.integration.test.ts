import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "./create-app.ts";
import { createPostgresDatabase } from "./platform/postgres-database.ts";
import { makeAuth, makeSpaces } from "./testing/make-app.ts";

const reachableDatabase = createPostgresDatabase({ url: process.env.DATABASE_URL ?? "" });
const unroutableDatabase = createPostgresDatabase({
  // secretlint-disable-next-line -- adresse TEST-NET-1 non routable, sans vrai identifiant
  url: "postgresql://app:unused@192.0.2.1:5432/dezyn",
});

afterAll(() => Promise.all([reachableDatabase.close(), unroutableDatabase.close()]));

describe("GET /health", () => {
  it("répond 200 quand PostgreSQL répond", async () => {
    const app = createApp({
      db: reachableDatabase,
      auth: makeAuth(),
      log: () => undefined,
      spaces: makeSpaces(),
    });

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("répond 503 en moins de 3 s quand PostgreSQL est injoignable", async () => {
    const app = createApp({
      db: unroutableDatabase,
      auth: makeAuth(),
      log: () => undefined,
      spaces: makeSpaces(),
    });
    const startedAt = performance.now();

    const response = await app.request("/health");

    expect(response.status).toBe(503);
    expect(performance.now() - startedAt).toBeLessThan(3_000);
  });

  it("répond 503 une fois la connexion à PostgreSQL fermée", async () => {
    const closedDatabase = createPostgresDatabase({ url: process.env.DATABASE_URL ?? "" });
    await closedDatabase.close();
    const app = createApp({
      db: closedDatabase,
      auth: makeAuth(),
      log: () => undefined,
      spaces: makeSpaces(),
    });

    const response = await app.request("/health");

    expect(response.status).toBe(503);
  });
});
