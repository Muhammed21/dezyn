import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createSmtpMailer } from "./smtp-mailer.ts";

const SMTP_PORT = Number(process.env.MAILPIT_SMTP_PORT ?? 1025);
const MAILPIT_API = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? 8025}/api/v1`;

const Search = z.object({
  messages: z.array(
    z.object({
      ID: z.string(),
      From: z.object({ Address: z.string() }),
      Subject: z.string(),
    }),
  ),
});
const Message = z.object({ Text: z.string() });

const receivedBy = async (to: string) => {
  const search = Search.parse(
    await (await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`)).json(),
  );
  return Promise.all(
    search.messages.map(async ({ ID, From, Subject }) => ({
      from: From.Address,
      subject: Subject,
      text: Message.parse(await (await fetch(`${MAILPIT_API}/message/${ID}`)).json()).Text,
    })),
  );
};

describe("envoi d'email par SMTP, contre le Mailpit de compose.yaml", () => {
  it("remet l'email au destinataire, avec l'expéditeur, le sujet et le texte", async () => {
    const to = `invite-${randomUUID()}@dezyn.test`;
    const mailer = createSmtpMailer({
      host: "127.0.0.1",
      port: SMTP_PORT,
      from: "dezyn <no-reply@dezyn.test>",
    });

    await mailer.send({
      to,
      subject: "Invitation à rejoindre « Studio » sur dezyn",
      text: "Acceptez l'invitation : http://127.0.0.1:5173/invitations/abc",
    });

    expect(await receivedBy(to)).toEqual([
      {
        from: "no-reply@dezyn.test",
        subject: "Invitation à rejoindre « Studio » sur dezyn",
        text: expect.stringContaining("http://127.0.0.1:5173/invitations/abc"),
      },
    ]);
  });
});
