import { describe, expect, it } from "vitest";

import { createPostgresDatabase } from "#db";
import type { LogRecord } from "#platform/logging.ts";
import type { Fetch } from "#platform/resend-mailer.ts";
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

type Bindings = (databaseUrl: string) => Readonly<Record<string, unknown>>;

const PRODUCTION: Bindings = (databaseUrl) => ({ HYPERDRIVE: { connectionString: databaseUrl } });

const RESEND: Bindings = (databaseUrl) => ({
  ...PRODUCTION(databaseUrl),
  RESEND_API_KEY: "re_cle_de_test",
  MAIL_FROM: "no-reply@dezyn.dev",
});

const PREVIEW: Bindings = (databaseUrl) => ({ DATABASE_URL: databaseUrl, EMAIL_DELIVERY: "log" });

const INVITATION_SUBJECT = `Invitation à rejoindre « ${ADA.name} » sur dezyn`;

type Outcome = { readonly status: number; readonly logged: readonly LogRecord[] };

const refusing: Fetch = async () =>
  new Response(JSON.stringify({ name: "rate_limit_exceeded" }), { status: 429 });

const noOutgoingCall: Fetch = () => Promise.reject(new Error("aucun appel sortant attendu"));

const inviteGraceThroughWorker = (
  { bindings, fetch }: { readonly bindings: Bindings; readonly fetch: Fetch },
  check: (outcome: Outcome) => void,
) =>
  withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
    await migrate({ connectionString: migratorUrl });
    const logged: LogRecord[] = [];
    const worker = createWorker({
      log: (record) => logged.push(record),
      assertSchema: async () => undefined,
      fetch,
    });
    const app: App = {
      request: (input, init) =>
        worker.fetch(
          new Request(input, init),
          {
            BETTER_AUTH_SECRET: "secret-de-test-de-32-caracteres-au-moins",
            BETTER_AUTH_URL: BASE_URL,
            WEB_URL,
            TRUSTED_IP_HEADER: "x-forwarded-for",
            ...bindings(appUrl),
          },
          { waitUntil: () => undefined },
        ),
    };
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

describe("le Worker envoie les emails par Resend", () => {
  it("une invitation répond 201 et poste l'email à Resend, vers l'invitée, avec son lien", async () => {
    const posted: unknown[] = [];
    const fetch: Fetch = async (_, init) => {
      posted.push(await new Response(init.body).json());
      return new Response(JSON.stringify({ id: "49a3999c" }), { status: 200 });
    };

    await inviteGraceThroughWorker({ bindings: RESEND, fetch }, ({ status }) => {
      expect(status).toBe(201);
    });

    expect(posted).toEqual([
      {
        from: "dezyn <no-reply@dezyn.dev>",
        to: GRACE.email,
        subject: INVITATION_SUBJECT,
        text: expect.stringContaining(`${WEB_URL}/invitations/`),
      },
    ]);
  });

  it("un refus de Resend fait répondre l'invitation 503, et l'échec est journalisé sans le lien", async () => {
    await inviteGraceThroughWorker({ bindings: RESEND, fetch: refusing }, ({ status, logged }) => {
      expect(status).toBe(503);
      expect(logged).toContainEqual({
        level: "error",
        msg: "email send failed",
        status: 429,
        reason: "rate_limit_exceeded",
      });
      expect(JSON.stringify(logged)).not.toContain("/invitations/");
    });
  });

  it("sans RESEND_API_KEY, une invitation répond 503 et l'email est journalisé sans son lien", async () => {
    await inviteGraceThroughWorker(
      { bindings: PRODUCTION, fetch: noOutgoingCall },
      ({ status, logged }) => {
        expect(status).toBe(503);
        expect(logged).toContainEqual({
          level: "warn",
          msg: "email not sent",
          to: GRACE.email,
          subject: INVITATION_SUBJECT,
        });
        expect(JSON.stringify(logged)).not.toContain("/invitations/");
      },
    );
  });
});

describe("le Worker de preview", () => {
  it("joint sa base par DATABASE_URL, et une invitation répond 201 en journalisant l'email sans son lien", async () => {
    await inviteGraceThroughWorker(
      { bindings: PREVIEW, fetch: noOutgoingCall },
      ({ status, logged }) => {
        expect(status).toBe(201);
        expect(logged).toContainEqual({
          level: "info",
          msg: "email logged instead of sent",
          to: GRACE.email,
          subject: INVITATION_SUBJECT,
        });
        expect(JSON.stringify(logged)).not.toContain("/invitations/");
      },
    );
  });
});
