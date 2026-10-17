import { describe, expect, it } from "vitest";

import { makeApp, makeDatabase } from "./testing/make-app.ts";

const UNREACHABLE = { ping: () => Promise.reject(new Error("connection timeout")) };

describe("GET /health", () => {
  it("répond 200 avec le statut ok quand la base répond", async () => {
    const { app } = makeApp();

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("répond 503 en problem+json quand la base ne répond pas", async () => {
    const { app } = makeApp({ db: makeDatabase(UNREACHABLE) });

    const response = await app.request("/health", { headers: { "x-correlation-id": "sonde-1" } });

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Service indisponible",
      status: 503,
      instance: "/health",
      correlationId: "sonde-1",
    });
  });
});
