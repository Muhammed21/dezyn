import { describe, expect, it } from "vitest";

import type { LogRecord } from "#platform/logging.ts";

import { createWorker } from "./worker.ts";

const makeContext = () => ({ waitUntil: () => undefined });

describe("le Worker", () => {
  it("répond 500 au format problème et nomme chaque binding en cause quand sa configuration est invalide", async () => {
    const logged: LogRecord[] = [];
    const worker = createWorker({ log: (record) => logged.push(record) });

    const response = await worker.fetch(
      new Request("https://api.dezyn.app/health"),
      { BETTER_AUTH_URL: "https://api.dezyn.app", WEB_URL: "pas une url" },
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
});
