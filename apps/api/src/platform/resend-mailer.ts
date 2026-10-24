import { z } from "zod";

import { err, ok } from "@repo/result";

import { errorDetails, type LogSink } from "./logging.ts";
import type { Mailer } from "./mailer.ts";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const SENDER_NAME = "dezyn";
const TIMEOUT_MS = 10_000;

const ResendError = z.object({ name: z.string() });

const reasonOf = async (response: Response): Promise<{ readonly reason?: string }> => {
  const parsed = ResendError.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { reason: parsed.data.name } : {};
};

export const createResendMailer = ({
  apiKey,
  from,
  fetch,
  log,
}: {
  readonly apiKey: string;
  readonly from: string;
  readonly fetch: Fetch;
  readonly log: LogSink;
}): Mailer => ({
  send: async ({ to, subject, text }) => {
    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(new Error(`no answer from Resend after ${TIMEOUT_MS} ms`)),
      TIMEOUT_MS,
    );
    try {
      const response = await fetch(RESEND_EMAILS_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: `${SENDER_NAME} <${from}>`, to, subject, text }),
        signal: timeout.signal,
      });
      if (!response.ok) {
        log({
          level: "error",
          msg: "email send failed",
          status: response.status,
          ...(await reasonOf(response)),
        });
        return err("mail_unavailable");
      }
      return ok(undefined);
    } catch (error) {
      log({ level: "error", msg: "email send failed", ...errorDetails(error) });
      return err("mail_unavailable");
    } finally {
      clearTimeout(timer);
    }
  },
});
