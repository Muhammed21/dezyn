import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { migrate } from "./migrate.ts";
import { secretVersionsInUse } from "./secret-versions.ts";
import { onClient } from "./testing/clients.ts";
import { withThrowawayDatabase } from "./testing/throwaway-database.ts";

const NOW = new Date("2026-10-26T12:00:00Z");
const BEFORE_NOW = new Date("2026-10-26T11:59:59Z");
const AFTER_NOW = new Date("2026-10-26T12:00:01Z");

type SigningKey = { readonly envelope: string; readonly expiresAt: Date | null };

const versionsInUseAmong = (keys: readonly SigningKey[]) =>
  withThrowawayDatabase(async ({ migratorUrl }) => {
    await migrate({ connectionString: migratorUrl });
    await onClient(migratorUrl, (client) =>
      keys.reduce<Promise<unknown>>(
        (previous, { envelope, expiresAt }) =>
          previous.then(() =>
            client.query(
              "INSERT INTO identity_jwks (id, public_key, private_key, created_at, expires_at) VALUES ($1, '{}', $2, $3, $4)",
              [randomUUID(), JSON.stringify(envelope), BEFORE_NOW, expiresAt],
            ),
          ),
        Promise.resolve(),
      ),
    );
    return secretVersionsInUse({ connectionString: migratorUrl, now: NOW });
  });

describe("secretVersionsInUse", () => {
  it("donne la version de chaque clé valide, legacy pour une clé sans enveloppe", async () => {
    expect(
      await versionsInUseAmong([
        { envelope: "a1b2c3", expiresAt: null },
        { envelope: "$ba$2$a1b2c3", expiresAt: AFTER_NOW },
        { envelope: "$ba$10$a1b2c3", expiresAt: null },
      ]),
    ).toEqual(["legacy", "2", "10"]);
  });

  it("range legacy en tête, puis les versions en nombres", async () => {
    expect(
      await versionsInUseAmong([
        { envelope: "$ba$10$a1b2c3", expiresAt: null },
        { envelope: "$ba$9$a1b2c3", expiresAt: null },
        { envelope: "a1b2c3", expiresAt: null },
        { envelope: "$ba$2$a1b2c3", expiresAt: null },
      ]),
    ).toEqual(["legacy", "2", "9", "10"]);
  });

  it("ne lit une version que dans une enveloppe en tête de la clé", async () => {
    expect(await versionsInUseAmong([{ envelope: 'a1"$ba$7$b2', expiresAt: null }])).toEqual([
      "legacy",
    ]);
  });

  it("ignore une clé expirée, y compris à l'instant même de son expiration", async () => {
    expect(
      await versionsInUseAmong([
        { envelope: "$ba$3$a1b2c3", expiresAt: BEFORE_NOW },
        { envelope: "$ba$4$a1b2c3", expiresAt: NOW },
        { envelope: "$ba$5$a1b2c3", expiresAt: AFTER_NOW },
      ]),
    ).toEqual(["5"]);
  });

  it("nomme une version une seule fois, même portée par plusieurs clés", async () => {
    expect(
      await versionsInUseAmong([
        { envelope: "$ba$2$a1b2c3", expiresAt: null },
        { envelope: "$ba$2$d4e5f6", expiresAt: null },
      ]),
    ).toEqual(["2"]);
  });

  it("ne donne rien sans clé valide", async () => {
    expect(await versionsInUseAmong([])).toEqual([]);
  });
});
