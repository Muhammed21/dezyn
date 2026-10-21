import { readApiConfig } from "#platform/api-config.ts";
import { createJsonLineSink } from "#platform/json-line-sink.ts";
import { superviseProcess } from "#platform/process-supervision.ts";
import { LATEST_MIGRATION } from "@repo/db";

import { startApi } from "./start-api.ts";

const config = readApiConfig(process.env);
if (!config.ok) {
  throw new Error(
    [
      "Configuration invalide, voir .env.example :",
      ...config.error.map((issue) => `- ${issue}`),
    ].join("\n"),
  );
}

const log = createJsonLineSink({
  write: (line) => process.stdout.write(line),
  now: () => new Date(),
});
const api = await startApi({ ...config.value, migration: LATEST_MIGRATION, log });
log({ level: "info", msg: "listening", url: api.url });
superviseProcess({ host: process, api, log });
