import { connect } from "node:net";

import { describe, expect, it } from "vitest";

import { LATEST_MIGRATION, migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { startApi } from "./start-api.ts";

const CONFIG = {
  authSecret: "secret-de-test-de-32-caracteres-au-moins",
  baseURL: "http://127.0.0.1:3000",
  trustedIpHeader: "x-forwarded-for",
  smtp: { host: "127.0.0.1", port: 1025, from: "dezyn <no-reply@dezyn.test>" },
  webUrl: "http://127.0.0.1:5173",
};

describe("startApi", () => {
  it("refuse de démarrer sur un schéma en retard, en nommant la migration manquante", () =>
    withThrowawayDatabase(async ({ appUrl }) => {
      await expect(
        startApi({
          databaseUrl: appUrl,
          migration: LATEST_MIGRATION,
          port: 0,
          log: () => undefined,
          ...CONFIG,
        }),
      ).rejects.toThrow(
        `Schéma en retard : la migration ${LATEST_MIGRATION.tag} n'est pas appliquée`,
      );
    }));

  it("démarre sur un schéma à jour et répond à la sonde de santé", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });

      const api = await startApi({
        databaseUrl: appUrl,
        migration: LATEST_MIGRATION,
        port: 0,
        log: () => undefined,
        ...CONFIG,
      });
      try {
        const response = await fetch(new URL("/health", api.url));

        expect(response.status).toBe(200);
      } finally {
        await api.close();
      }
    }));

  it("n'écoute plus une fois arrêtée", () =>
    withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
      await migrate({ connectionString: migratorUrl });
      const api = await startApi({
        databaseUrl: appUrl,
        migration: LATEST_MIGRATION,
        port: 0,
        log: () => undefined,
        ...CONFIG,
      });

      await api.close();

      await expect(fetch(new URL("/health", api.url))).rejects.toThrow("fetch failed");
    }));

  it(
    "ferme en 408 une connexion dont les en-têtes n'arrivent pas en entier en 10 s",
    () =>
      withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
        await migrate({ connectionString: migratorUrl });
        const api = await startApi({
          databaseUrl: appUrl,
          migration: LATEST_MIGRATION,
          port: 0,
          log: () => undefined,
          ...CONFIG,
        });
        try {
          const { port } = new URL(api.url);
          const startedAt = Date.now();

          const reply = await new Promise<string>((done, fail) => {
            const socket = connect({ host: "127.0.0.1", port: Number(port) }, () => {
              socket.write("GET /health HTTP/1.1\r\nhost: 127.0.0.1\r\n");
            });
            socket.setEncoding("utf8");
            socket.once("data", (data: string) => {
              socket.destroy();
              done(data);
            });
            socket.once("error", fail);
          });

          expect(reply).toMatch(/^HTTP\/1\.1 408 /);
          expect(Date.now() - startedAt).toBeGreaterThanOrEqual(10_000);
        } finally {
          await api.close();
        }
      }),
    20_000,
  );

  it(
    "ferme en 408 une requête dont le corps n'arrive pas en entier en 30 s",
    () =>
      withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
        await migrate({ connectionString: migratorUrl });
        const api = await startApi({
          databaseUrl: appUrl,
          migration: LATEST_MIGRATION,
          port: 0,
          log: () => undefined,
          ...CONFIG,
        });
        try {
          const { port } = new URL(api.url);
          const startedAt = Date.now();

          const reply = await new Promise<string>((done, fail) => {
            const socket = connect({ host: "127.0.0.1", port: Number(port) }, () => {
              socket.write(
                [
                  "POST /auth/sign-in/email HTTP/1.1",
                  "host: 127.0.0.1",
                  "content-type: application/json",
                  "content-length: 10",
                  "",
                  "{",
                ].join("\r\n"),
              );
            });
            socket.setEncoding("utf8");
            socket.once("data", (data: string) => {
              socket.destroy();
              done(data);
            });
            socket.once("error", fail);
          });

          expect(reply).toMatch(/^HTTP\/1\.1 408 /);
          expect(Date.now() - startedAt).toBeGreaterThanOrEqual(30_000);
        } finally {
          await api.close();
        }
      }),
    40_000,
  );
});
