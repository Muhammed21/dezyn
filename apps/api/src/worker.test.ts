import { describe, expect, it } from "vitest";

import type { LogRecord } from "#platform/logging.ts";

import { createWorker } from "./worker.ts";

const makeContext = () => ({ waitUntil: () => undefined });

const HYPERDRIVE_URL = "postgresql://app@127.0.0.1:1/dezyn";

const makeBindings = () => ({
  HYPERDRIVE: { connectionString: HYPERDRIVE_URL },
  BETTER_AUTH_SECRET: "secret-de-test-de-32-caracteres-au-moins",
  BETTER_AUTH_URL: "https://api.dezyn.dev",
  WEB_URL: "https://dezyn.dev",
});

const UNKNOWN_ROUTE = "https://api.dezyn.dev/route-inconnue";

const SCHEMA_BEHIND = new Error("Schéma en retard : la migration 0042_x n'est pas appliquée.");

const succeeding = () => async () => undefined;

describe("le Worker", () => {
  it("répond 500 au format problème et nomme chaque binding en cause quand sa configuration est invalide", async () => {
    const logged: LogRecord[] = [];
    const worker = createWorker({
      log: (record) => logged.push(record),
      assertSchema: succeeding(),
    });

    const response = await worker.fetch(
      new Request("https://api.dezyn.dev/health"),
      { BETTER_AUTH_URL: "https://api.dezyn.dev", WEB_URL: "pas une url" },
      makeContext(),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Erreur interne",
      status: 500,
      instance: "/health",
    });
    expect(logged).toEqual([
      {
        level: "error",
        msg: "invalid configuration",
        issues: [
          "HYPERDRIVE : manquante",
          "BETTER_AUTH_SECRET : manquante",
          "WEB_URL : URL http(s) attendue",
        ],
      },
    ]);
  });

  it("répond 503 et journalise la migration manquante quand le schéma est en retard", async () => {
    const logged: LogRecord[] = [];
    const worker = createWorker({
      log: (record) => logged.push(record),
      assertSchema: async () => {
        throw SCHEMA_BEHIND;
      },
    });

    const response = await worker.fetch(new Request(UNKNOWN_ROUTE), makeBindings(), makeContext());

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Service indisponible",
      status: 503,
      instance: "/route-inconnue",
    });
    expect(logged).toEqual([
      expect.objectContaining({
        level: "error",
        msg: "schema check failed",
        error: SCHEMA_BEHIND.message,
      }),
    ]);
  });

  it("journalise aussi une vérification qui lève autre chose qu'une Error", async () => {
    const logged: LogRecord[] = [];
    const worker = createWorker({
      log: (record) => logged.push(record),
      assertSchema: () => Promise.reject("base injoignable"),
    });

    const response = await worker.fetch(new Request(UNKNOWN_ROUTE), makeBindings(), makeContext());

    expect(response.status).toBe(503);
    expect(logged).toEqual([
      { level: "error", msg: "schema check failed", error: "base injoignable" },
    ]);
  });
});
