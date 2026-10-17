import { describe, expect, it } from "vitest";

import { createApp } from "./create-app.ts";
import type { Database } from "./platform/database.ts";

const makeDatabase = (overrides: Partial<Database> = {}): Database => ({
  ping: () => Promise.resolve(),
  ...overrides,
});

const UNREACHABLE = { ping: () => Promise.reject(new Error("connection timeout")) };

describe("GET /health", () => {
  it("répond 200 avec le statut ok quand la base répond", async () => {
    const app = createApp({ db: makeDatabase() });

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("répond 503 quand la base ne répond pas", async () => {
    const app = createApp({ db: makeDatabase(UNREACHABLE) });

    const response = await app.request("/health");

    expect(response.status).toBe(503);
  });
});
