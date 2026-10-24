import { createTransport } from "nodemailer";

import { err, ok } from "@repo/result";

import { errorDetails, type LogSink } from "./logging.ts";
import type { Mailer } from "./mailer.ts";

const CONNECTION_TIMEOUT_MS = 5_000;
const GREETING_TIMEOUT_MS = 5_000;
const SOCKET_TIMEOUT_MS = 10_000;

export const createSmtpMailer = ({
  host,
  port,
  from,
  log,
}: {
  readonly host: string;
  readonly port: number;
  readonly from: string;
  readonly log: LogSink;
}): Mailer => {
  const transport = createTransport({
    host,
    port,
    secure: false,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });
  return {
    send: async ({ to, subject, text }) => {
      try {
        await transport.sendMail({ from, to, subject, text });
        return ok(undefined);
      } catch (error) {
        log({
          level: "error",
          msg: "smtp send failed",
          ...errorDetails(error),
        });
        return err("mail_unavailable");
      }
    },
  };
};
