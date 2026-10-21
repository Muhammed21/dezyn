import { createJsonLineSink } from "#platform/json-line-sink.ts";
import { superviseProcess } from "#platform/process-supervision.ts";
import { LATEST_MIGRATION } from "@repo/db";

import { startApi } from "./start-api.ts";

const required = (variable: string): string => {
  const value = process.env[variable];
  if (value === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return value;
};

const log = createJsonLineSink({
  write: (line) => process.stdout.write(line),
  now: () => new Date(),
});
const api = await startApi({
  databaseUrl: required("DATABASE_URL"),
  authSecret: required("BETTER_AUTH_SECRET"),
  baseURL: required("BETTER_AUTH_URL"),
  trustedIpHeader: process.env.TRUSTED_IP_HEADER ?? "x-forwarded-for",
  smtp: {
    host: required("SMTP_HOST"),
    port: Number(required("SMTP_PORT")),
    from: required("MAIL_FROM"),
  },
  webUrl: required("WEB_URL"),
  migration: LATEST_MIGRATION,
  port: Number(process.env.PORT ?? 3000),
  log,
});
log({ level: "info", msg: "listening", url: api.url });
superviseProcess({ host: process, api, log });
