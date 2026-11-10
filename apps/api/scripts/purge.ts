import { createPostgresDatabase } from "#db";
import { historyPurge } from "#modules/history/history-module.ts";
import { storageMeterOn } from "#modules/project/project-module.ts";
import { createJsonLineSink } from "#platform/json-line-sink.ts";
import { createSmtpMailer } from "#platform/smtp-mailer.ts";

const required = (variable: string): string => {
  const value = process.env[variable];
  if (value === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return value;
};

const log = createJsonLineSink({
  write: (line) => process.stderr.write(line),
  now: () => new Date(),
});
const mailer = createSmtpMailer({
  host: required("SMTP_HOST"),
  port: Number(required("SMTP_PORT")),
  from: required("MAIL_FROM"),
  log,
});
const db = createPostgresDatabase({ url: required("DATABASE_URL_HISTORY_MAINTAINER"), log });
try {
  const purged = await historyPurge({ db, meterOn: storageMeterOn, mailer, log })();
  console.log(JSON.stringify(purged, null, 2));
} finally {
  await db.close();
}
