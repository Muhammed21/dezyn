import { setTimeout as wait } from "node:timers/promises";

import { sql } from "drizzle-orm";

import type { PostgresDatabase, PostgresTransaction } from "#db";

const lockWaitIn = async (db: PostgresDatabase, attempts = 80): Promise<void> => {
  const {
    rows: [waiting],
  } = await db.orm.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE NOT l.granted AND a.datname = current_database()`,
  );
  if ((waiting?.count ?? 0) > 0 || attempts === 0) {
    return;
  }
  await wait(10);
  return lockWaitIn(db, attempts - 1);
};

export const whileHolding = async <T>(
  db: PostgresDatabase,
  {
    hold,
    meanwhile,
  }: {
    readonly hold: (tx: PostgresTransaction) => Promise<unknown>;
    readonly meanwhile: () => T;
  },
): Promise<T> => {
  const { concurrent } = await db.orm.transaction(async (tx) => {
    await hold(tx);
    const started = meanwhile();
    await lockWaitIn(db);
    return { concurrent: started };
  });
  return concurrent;
};
