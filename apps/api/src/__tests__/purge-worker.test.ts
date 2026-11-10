import { describe, expect, it } from "vitest";
import { experimental_readRawConfig } from "wrangler";

import type { LogRecord } from "#platform/logging.ts";
import type { Fetch } from "#platform/resend-mailer.ts";

import { createPurgeWorker } from "../purge-worker.ts";

const noOutgoingCall: Fetch = () => Promise.reject(new Error("aucun appel sortant attendu"));

const makeContext = () => ({ waitUntil: () => undefined });

const makeController = () => ({ cron: "*/15 * * * *", scheduledTime: Date.now() });

const makeBindings = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  HYPERDRIVE: { connectionString: "postgresql://history_maintainer@127.0.0.1:1/dezyn" },
  MAIL_FROM: "no-reply@dezyn.dev",
  ...overrides,
});

const SCHEMA_BEHIND = new Error("Schéma en retard : la migration 0042_x n'est pas appliquée.");

const purgeConfig = () =>
  experimental_readRawConfig({
    config: new URL("../../wrangler.purge.jsonc", import.meta.url).pathname,
  }).rawConfig;

describe("la configuration du Worker dezyn-purge (ADR 0042 §2)", () => {
  it("passe toutes les 15 minutes, sans route ni URL publique ni preview", () => {
    expect(purgeConfig()).toMatchObject({
      name: "dezyn-purge",
      main: "src/purge-worker.ts",
      triggers: { crons: ["*/15 * * * *"] },
      workers_dev: false,
      observability: { enabled: true },
    });
    expect(purgeConfig().routes).toBeUndefined();
    expect(purgeConfig().env).toBeUndefined();
  });

  it("se connecte par son propre Hyperdrive, distinct de celui de l'API", () => {
    const [hyperdrive] = purgeConfig().hyperdrive ?? [];
    const api = experimental_readRawConfig({
      config: new URL("../../wrangler.jsonc", import.meta.url).pathname,
    }).rawConfig;

    expect(hyperdrive?.binding).toBe("HYPERDRIVE");
    expect(hyperdrive?.id).not.toBe(api.hyperdrive?.[0]?.id);
  });
});

describe("le Worker dezyn-purge", () => {
  it("ne purge rien et nomme chaque binding en cause quand sa configuration est invalide", async () => {
    const logged: LogRecord[] = [];
    const worker = createPurgeWorker({
      fetch: noOutgoingCall,
      log: (record) => logged.push(record),
      assertSchema: async () => undefined,
    });

    await worker.scheduled(
      makeController(),
      { MAIL_FROM: "pas une adresse", EMAIL_DELIVERY: "smtp" },
      makeContext(),
    );

    expect(logged).toEqual([
      {
        level: "error",
        msg: "invalid configuration",
        issues: [
          "HYPERDRIVE : binding Hyperdrive attendu",
          "MAIL_FROM : adresse email attendue",
          "EMAIL_DELIVERY : seule la valeur log est admise",
        ],
      },
    ]);
  });

  it("ne purge rien quand le schéma de la base est en retard, et le journalise", async () => {
    const logged: LogRecord[] = [];
    const checked: string[] = [];
    const worker = createPurgeWorker({
      fetch: noOutgoingCall,
      log: (record) => logged.push(record),
      assertSchema: async (databaseUrl) => {
        checked.push(databaseUrl);
        throw SCHEMA_BEHIND;
      },
    });

    await worker.scheduled(makeController(), makeBindings(), makeContext());

    expect(checked).toEqual(["postgresql://history_maintainer@127.0.0.1:1/dezyn"]);
    expect(logged).toEqual([
      expect.objectContaining({
        level: "error",
        msg: "schema check failed",
        error: SCHEMA_BEHIND.message,
      }),
    ]);
  });
});
