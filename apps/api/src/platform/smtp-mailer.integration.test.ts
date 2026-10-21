import { randomUUID } from "node:crypto";
import { createServer, type Server, type Socket } from "node:net";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { err, ok } from "@repo/result";

import type { LogRecord } from "./logging.ts";
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
      log: () => undefined,
    });

    const sent = await mailer.send({
      to,
      subject: "Invitation à rejoindre « Studio » sur dezyn",
      text: "Acceptez l'invitation : http://127.0.0.1:5173/invitations/abc",
    });

    expect(sent).toEqual(ok(undefined));
    expect(await receivedBy(to)).toEqual([
      {
        from: "no-reply@dezyn.test",
        subject: "Invitation à rejoindre « Studio » sur dezyn",
        text: expect.stringContaining("http://127.0.0.1:5173/invitations/abc"),
      },
    ]);
  });
});

const EMAIL = { to: "grace@dezyn.test", subject: "Invitation", text: "Lien" };

const servers: Server[] = [];

afterEach(() => {
  servers.splice(0).forEach((server) => server.close());
});

const listening = (onConnection: (socket: Socket) => void) =>
  new Promise<number>((resolve) => {
    const server = createServer((socket) => {
      socket.on("error", () => undefined);
      onConnection(socket);
    });
    servers.push(server);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : 0);
    });
  });

const silentAfterGreeting = (socket: Socket) => {
  socket.write("220 smtp.dezyn.test\r\n");
  socket.once("data", () => socket.write("250 smtp.dezyn.test\r\n"));
};

const sendTo = async ({ host, port }: { readonly host: string; readonly port: number }) => {
  const logged: LogRecord[] = [];
  const mailer = createSmtpMailer({
    host,
    port,
    from: "dezyn <no-reply@dezyn.test>",
    log: (record) => logged.push(record),
  });
  const startedAt = performance.now();
  const sent = await mailer.send(EMAIL);
  return { sent, logged, elapsedMs: performance.now() - startedAt };
};

const SEND_FAILED = expect.objectContaining({ level: "error", msg: "smtp send failed" });

describe("un serveur SMTP lent ou absent ne bloque pas l'envoi", () => {
  it("un serveur injoignable rend mail_unavailable, et l'échec est journalisé", async () => {
    const port = await listening((socket) => socket.destroy());

    const { sent, logged } = await sendTo({ host: "127.0.0.1", port });

    expect(sent).toEqual(err("mail_unavailable"));
    expect(logged).toEqual([SEND_FAILED]);
  });

  it("un serveur qui ne salue pas abandonne en moins de 6 s", async () => {
    const port = await listening(() => undefined);

    const { sent, logged, elapsedMs } = await sendTo({ host: "127.0.0.1", port });

    expect(sent).toEqual(err("mail_unavailable"));
    expect(logged).toEqual([SEND_FAILED]);
    expect(elapsedMs).toBeLessThan(6_000);
  }, 15_000);

  it("un serveur qui se tait en cours d'échange abandonne en moins de 11 s", async () => {
    const port = await listening(silentAfterGreeting);

    const { sent, elapsedMs } = await sendTo({ host: "127.0.0.1", port });

    expect(sent).toEqual(err("mail_unavailable"));
    expect(elapsedMs).toBeGreaterThan(9_000);
    expect(elapsedMs).toBeLessThan(11_000);
  }, 20_000);

  it("une adresse qui ne répond pas abandonne la connexion en moins de 6 s", async () => {
    // secretlint-disable-next-line -- adresse TEST-NET-1 non routable
    const { sent, elapsedMs } = await sendTo({ host: "192.0.2.1", port: 25 });

    expect(sent).toEqual(err("mail_unavailable"));
    expect(elapsedMs).toBeLessThan(6_000);
  }, 15_000);
});
