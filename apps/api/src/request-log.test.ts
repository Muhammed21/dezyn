import { describe, expect, it } from "vitest";

import { makeApp } from "#testing/make-app.ts";

const requestRecords = async (path: string, init: RequestInit = {}) => {
  const { app, records } = makeApp();
  app.get("/panne", () => {
    throw new Error("panne");
  });
  await app.request(path, init);
  return records.filter((record) => record.msg === "request");
};

describe("log de requête", () => {
  it("laisse un log par requête avec méthode, chemin, statut, durée et identifiant de corrélation", async () => {
    const records = await requestRecords("/health?verbose=1", {
      headers: { "x-correlation-id": "log-1" },
    });

    expect(records).toEqual([
      {
        level: "info",
        msg: "request",
        method: "GET",
        path: "/health",
        status: 200,
        durationMs: expect.any(Number),
        correlationId: "log-1",
      },
    ]);
  });

  it("note le statut final d'une requête en erreur", async () => {
    const records = await requestRecords("/panne", { method: "GET" });

    expect(records).toEqual([expect.objectContaining({ status: 500, path: "/panne" })]);
  });

  it("note la méthode de la requête", async () => {
    const records = await requestRecords("/health", { method: "POST" });

    expect(records).toEqual([expect.objectContaining({ method: "POST", status: 404 })]);
  });

  it("mesure la durée de la requête en millisecondes", async () => {
    const [record] = await requestRecords("/health");

    expect(record?.durationMs).toBeGreaterThanOrEqual(0);
    expect(record?.durationMs).toBeLessThan(1_000);
  });
});
