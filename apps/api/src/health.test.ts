import { describe, expect, it } from "vitest";

import { makeApp, makeAuth, makeDatabase } from "#testing/make-app.ts";
import { err } from "@repo/result";

const UNREACHABLE = { ping: () => Promise.reject(new Error("connection timeout")) };
const UNDECRYPTABLE_KEY = {
  checkSigningKey: () => Promise.resolve(err<"undecryptable">("undecryptable")),
};

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

  it("répond 503 en problem+json et journalise la cause quand la clé de signature ne se déchiffre pas", async () => {
    const { app, records } = makeApp({ auth: makeAuth(UNDECRYPTABLE_KEY) });

    const response = await app.request("/health", { headers: { "x-correlation-id": "sonde-2" } });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Service indisponible",
      status: 503,
      instance: "/health",
      correlationId: "sonde-2",
    });
    expect(records).toContainEqual({
      level: "error",
      msg: "signing key undecryptable",
      correlationId: "sonde-2",
    });
  });

  it("ne contrôle pas la clé de signature quand la base ne répond pas", async () => {
    const checks: string[] = [];
    const { app } = makeApp({
      db: makeDatabase(UNREACHABLE),
      auth: makeAuth({
        checkSigningKey: async () => {
          checks.push("clé");
          return err("undecryptable");
        },
      }),
    });

    const response = await app.request("/health");

    expect(response.status).toBe(503);
    expect(checks).toEqual([]);
  });
});
