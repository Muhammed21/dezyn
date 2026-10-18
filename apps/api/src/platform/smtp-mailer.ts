import { createTransport } from "nodemailer";

import type { Mailer } from "./mailer.ts";

export const createSmtpMailer = ({
  host,
  port,
  from,
}: {
  readonly host: string;
  readonly port: number;
  readonly from: string;
}): Mailer => {
  const transport = createTransport({ host, port, secure: false });
  return {
    send: async ({ to, subject, text }) => {
      await transport.sendMail({ from, to, subject, text });
    },
  };
};
