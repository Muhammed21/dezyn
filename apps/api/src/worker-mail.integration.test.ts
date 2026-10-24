import { describe, expect, it } from "vitest";

import { createPostgresDatabase } from "#db";
import type { EmailBinding } from "#platform/cloudflare-mailer.ts";
import type { LogRecord } from "#platform/logging.ts";
import {
  ADA,
  type App,
  BASE_URL,
  GRACE,
  obtainAccessToken,
  WEB_URL,
} from "#testing/authorization-flow.ts";
import { invite, personalSpaceOf, switchToTeam } from "#testing/space-fixtures.ts";
import { migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { createWorker } from "./worker.ts";

type SentEmail = Parameters<EmailBinding["send"]>[0];

const MAIL_FROM = "no-reply@dezyn.dev";

const INVITATION_SUBJECT = `Invitation à rejoindre « ${ADA.name} » sur dezyn`;

const workerApp = (
  worker: ReturnType<typeof createWorker>,
  databaseUrl: string,
  email: Readonly<Record<string, unknown>>,
): App => ({
  request: (input, init) =>
    worker.fetch(
      new Request(input, init),
      {
        HYPERDRIVE: { connectionString: databaseUrl },
        BETTER_AUTH_SECRET: "secret-de-test-de-32-caracteres-au-moins",
        BETTER_AUTH_URL: BASE_URL,
        WEB_URL,
        TRUSTED_IP_HEADER: "x-forwarded-for",
        ...email,
      },
      { waitUntil: () => undefined },
    ),
});

type Outcome = { readonly status: number; readonly logged: readonly LogRecord[] };

const inviteGraceThroughWorker = (
  email: Readonly<Record<string, unknown>>,
  check: (outcome: Outcome) => void,
) =>
  withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
    await migrate({ connectionString: migratorUrl });
    const logged: LogRecord[] = [];
    const app = workerApp(
      createWorker({ log: (record) => logged.push(record), assertSchema: async () => undefined }),
      appUrl,
      email,
    );
    const db = createPostgresDatabase({ url: appUrl });
    try {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);
      await switchToTeam(db, spaceId);

      const response = await invite(app, { accessToken, spaceId });

      check({ status: response.status, logged });
    } finally {
      await db.close();
    }
  });

const failure = (code: string) => Object.assign(new Error("sender not verified"), { code });

describe("le Worker envoie les emails par le binding send_email", () => {
  it("une invitation répond 201 et part de MAIL_FROM vers l'invitée, avec son lien", async () => {
    const sent: SentEmail[] = [];
    const binding: EmailBinding = {
      send: async (message) => {
        sent.push(message);
        return { messageId: "m-1" };
      },
    };

    await inviteGraceThroughWorker({ EMAIL: binding, MAIL_FROM }, ({ status }) => {
      expect(status).toBe(201);
    });

    expect(sent).toEqual([
      {
        to: GRACE.email,
        from: { email: MAIL_FROM, name: "dezyn" },
        subject: INVITATION_SUBJECT,
        text: expect.stringContaining(`${WEB_URL}/invitations/`),
      },
    ]);
  });

  it("un binding qui échoue fait répondre l'invitation 503, et l'échec est journalisé sans le lien", async () => {
    const binding: EmailBinding = {
      send: () => Promise.reject(failure("E_SENDER_NOT_VERIFIED")),
    };

    await inviteGraceThroughWorker({ EMAIL: binding, MAIL_FROM }, ({ status, logged }) => {
      expect(status).toBe(503);
      expect(logged).toContainEqual(
        expect.objectContaining({
          level: "error",
          msg: "email send failed",
          error: "sender not verified",
          code: "E_SENDER_NOT_VERIFIED",
        }),
      );
      expect(JSON.stringify(logged)).not.toContain("/invitations/");
    });
  });

  it("sans binding, comme en preview, une invitation répond 503 et l'email est journalisé sans son lien", async () => {
    await inviteGraceThroughWorker({}, ({ status, logged }) => {
      expect(status).toBe(503);
      expect(logged).toContainEqual({
        level: "warn",
        msg: "email not sent",
        to: GRACE.email,
        subject: INVITATION_SUBJECT,
      });
      expect(JSON.stringify(logged)).not.toContain("/invitations/");
    });
  });
});
