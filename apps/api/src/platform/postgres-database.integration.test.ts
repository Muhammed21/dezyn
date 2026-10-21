import { setTimeout as wait } from "node:timers/promises";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "#db";
import type { LogRecord } from "#platform/logging.ts";

const QUERY_CANCELED = "57014";
const LOCK_NOT_AVAILABLE = "55P03";

const logged: LogRecord[] = [];
const db = createPostgresDatabase({
  url: process.env.DATABASE_URL ?? "",
  log: (record) => logged.push(record),
});

afterAll(() => db.close());

const elapsedSince = (startedAt: number) => performance.now() - startedAt;

describe("une connexion bloquée se libère seule", () => {
  it("une requête de plus de 2 s est annulée", async () => {
    const startedAt = performance.now();

    await expect(db.orm.execute(sql`SELECT pg_sleep(3)`)).rejects.toMatchObject({
      cause: { code: QUERY_CANCELED },
    });
    expect(elapsedSince(startedAt)).toBeLessThan(2_900);
  });

  it("une requête qui attend un verrou plus d'1 s abandonne", async () => {
    const holder = db.orm.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(7001)`);
      await wait(1_800);
    });
    await wait(100);
    const startedAt = performance.now();

    await expect(
      db.orm.transaction((tx) => tx.execute(sql`SELECT pg_advisory_xact_lock(7001)`)),
    ).rejects.toMatchObject({ cause: { code: LOCK_NOT_AVAILABLE } });
    expect(elapsedSince(startedAt)).toBeLessThan(1_600);
    await holder;
  });

  it("une transaction ouverte et inactive plus de 5 s est fermée, et la coupure journalisée", async () => {
    await expect(
      db.orm.transaction(async (tx) => {
        await tx.execute(sql`SELECT 1`);
        await wait(5_500);
        await tx.execute(sql`SELECT 1`);
      }),
    ).rejects.toThrow(/Failed query: rollback/);
    expect(logged).toContainEqual(
      expect.objectContaining({ level: "error", msg: "postgres connection lost" }),
    );
  }, 10_000);

  it("une connexion au repos coupée par PostgreSQL est journalisée", async () => {
    const restarted: LogRecord[] = [];
    const idle = createPostgresDatabase({
      url: process.env.DATABASE_URL ?? "",
      log: (record) => restarted.push(record),
    });
    const {
      rows: [backend],
    } = await idle.orm.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);

    await db.orm.execute(sql`SELECT pg_terminate_backend(${backend?.pid})`);
    await wait(200);

    expect(restarted).toContainEqual(
      expect.objectContaining({ level: "error", msg: "postgres connection lost" }),
    );
    await idle.close();
  });
});
