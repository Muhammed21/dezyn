import { err, ok } from "@repo/result";

import type { WorkerConfig } from "./api-config.ts";
import type { LogSink } from "./logging.ts";
import type { Mailer } from "./mailer.ts";
import { createResendMailer, type Fetch } from "./resend-mailer.ts";

const loggingMailer = (log: LogSink): Mailer => ({
  send: async ({ to, subject }) => {
    log({ level: "warn", msg: "email not sent", to, subject });
    return err("mail_unavailable");
  },
});

const journalingMailer = (log: LogSink): Mailer => ({
  send: async ({ to, subject }) => {
    log({ level: "info", msg: "email logged instead of sent", to, subject });
    return ok(undefined);
  },
});

export const workerMailerOf = ({
  email,
  emailDelivery,
  fetch,
  log,
}: Pick<WorkerConfig, "email" | "emailDelivery"> & {
  readonly fetch: Fetch;
  readonly log: LogSink;
}): Mailer => {
  if (email) {
    return createResendMailer({ ...email, fetch, log });
  }
  return emailDelivery === "log" ? journalingMailer(log) : loggingMailer(log);
};
