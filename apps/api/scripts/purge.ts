import { createPostgresDatabase } from "#db";
import { historyPurge } from "#modules/history/history-module.ts";
import { storageMeterOn } from "#modules/project/project-module.ts";
import { readPurgeConfig } from "#platform/api-config.ts";
import { createJsonLineSink } from "#platform/json-line-sink.ts";
import { createSmtpMailer } from "#platform/smtp-mailer.ts";

const config = readPurgeConfig(process.env);
if (!config.ok) {
  throw new Error(
    [
      "Configuration invalide, voir .env.example :",
      ...config.error.map((issue) => `- ${issue}`),
    ].join("\n"),
  );
}

const log = createJsonLineSink({
  write: (line) => process.stderr.write(line),
  now: () => new Date(),
});
const mailer = createSmtpMailer({ ...config.value.smtp, log });
const db = createPostgresDatabase({ url: config.value.databaseUrl, log });
try {
  const purged = await historyPurge({ db, meterOn: storageMeterOn, mailer, log })();
  console.log(JSON.stringify(purged, null, 2));
} finally {
  await db.close();
}
