import { describe, expect, it } from "vitest";

import { err } from "@repo/result";

import { createCloudflareMailer } from "./cloudflare-mailer.ts";
import type { LogRecord } from "./logging.ts";

const makeEmail = () => ({
  to: "grace@example.com",
  subject: "Invitation",
  text: "Rejoignez l'espace.",
});

const sendRejectedWith = async (reason: unknown) => {
  const logged: LogRecord[] = [];
  const mailer = createCloudflareMailer({
    binding: { send: () => Promise.reject(reason) },
    from: "no-reply@dezyn.dev",
    log: (record) => logged.push(record),
  });

  const result = await mailer.send(makeEmail());

  return { result, logged };
};

describe("l'envoi par Cloudflare Email Service", () => {
  it("une erreur sans code est journalisée sans code", async () => {
    const failure = new Error("delivery failed");

    const { result, logged } = await sendRejectedWith(failure);

    expect(result).toEqual(err("mail_unavailable"));
    expect(logged).toEqual([
      { level: "error", msg: "email send failed", error: "delivery failed", stack: failure.stack },
    ]);
  });

  it.each([
    ["une chaîne", "binding indisponible", "binding indisponible"],
    ["null", null, "null"],
  ])("un rejet par %s est journalisé tel quel", async (_, reason, error) => {
    const { result, logged } = await sendRejectedWith(reason);

    expect(result).toEqual(err("mail_unavailable"));
    expect(logged).toEqual([{ level: "error", msg: "email send failed", error }]);
  });
});
