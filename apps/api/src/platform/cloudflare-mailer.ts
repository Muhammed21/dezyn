import { err, ok } from "@repo/result";

import { errorDetails, type LogSink } from "./logging.ts";
import type { Mailer } from "./mailer.ts";

export type EmailBinding = {
  readonly send: (message: {
    readonly to: string;
    readonly from: { readonly email: string; readonly name: string };
    readonly subject: string;
    readonly text: string;
  }) => Promise<unknown>;
};

const SENDER_NAME = "dezyn";

const codeOf = (error: unknown): { readonly code?: string } =>
  typeof error === "object" && error !== null && "code" in error
    ? { code: String(error.code) }
    : {};

export const createCloudflareMailer = ({
  binding,
  from,
  log,
}: {
  readonly binding: EmailBinding;
  readonly from: string;
  readonly log: LogSink;
}): Mailer => ({
  send: async ({ to, subject, text }) => {
    try {
      await binding.send({ to, from: { email: from, name: SENDER_NAME }, subject, text });
      return ok(undefined);
    } catch (error) {
      log({ level: "error", msg: "email send failed", ...errorDetails(error), ...codeOf(error) });
      return err("mail_unavailable");
    }
  },
});
