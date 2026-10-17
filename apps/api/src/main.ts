import { LATEST_MIGRATION } from "@repo/db";

import { createJsonLineSink } from "./platform/json-line-sink.ts";
import { startApi } from "./start-api.ts";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL manquante : copier .env.example en .env");
}

const log = createJsonLineSink({
  write: (line) => process.stdout.write(line),
  now: () => new Date(),
});
const api = await startApi({
  databaseUrl,
  migration: LATEST_MIGRATION,
  port: Number(process.env.PORT ?? 3000),
  log,
});
log({ level: "info", msg: "listening", url: api.url });
