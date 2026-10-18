import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { schema } from "@repo/db";

import type { OutgoingEmail } from "../../platform/mailer.ts";
import type { PostgresDatabase } from "../../platform/postgres-database.ts";
import {
  type App,
  BASE_URL,
  obtainAccessToken,
  WEB_URL,
  withIdentityApp,
} from "../../testing/authorization-flow.ts";

const DAY_MS = 86_400_000;
const GRACE = "grace@dezyn.test";
const PLAN_REQUIRED = "https://dezyn.app/problems/plan-required";

const makeOutbox = () => {
  const sent: OutgoingEmail[] = [];
  return { sent, mailer: { send: async (email: OutgoingEmail) => void sent.push(email) } };
};

const invite = (
  app: App,
  { accessToken, spaceId, email = GRACE }: { accessToken: string; spaceId: string; email?: string },
) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/invitations`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });

const personalSpaceOf = async (db: PostgresDatabase, userId: string) => {
  const [membership] = await db.orm
    .select({ spaceId: schema.spaceMember.spaceId })
    .from(schema.spaceMember)
    .where(eq(schema.spaceMember.userId, userId));
  return membership?.spaceId ?? "";
};

const switchToTeam = (db: PostgresDatabase, spaceId: string) =>
  db.orm.update(schema.space).set({ plan: "team" }).where(eq(schema.space.id, spaceId));

const seedTeamSpace = async (db: PostgresDatabase) => {
  const spaceId = randomUUID();
  await db.orm
    .insert(schema.space)
    .values({ id: spaceId, name: "Studio Grace", plan: "team", createdAt: new Date() });
  return spaceId;
};

const seedTeamSpaceWith = async (
  db: PostgresDatabase,
  { userId, role }: { userId: string; role: "owner" | "editor" },
) => {
  const spaceId = await seedTeamSpace(db);
  await db.orm
    .insert(schema.spaceMember)
    .values({ id: randomUUID(), spaceId, userId, role, joinedAt: new Date() });
  return spaceId;
};

const tokenOf = (email: OutgoingEmail | undefined) =>
  new RegExp(`${WEB_URL}/invitations/([A-Za-z0-9_-]{43})`).exec(email?.text ?? "")?.[1] ?? "";

const hashOf = (token: string) => createHash("sha256").update(token).digest("base64url");

describe("un propriétaire d'un espace Team invite un éditeur par email (ADR 0011 §4)", () => {
  it("crée l'invitation pour 7 jours et envoie un lien dont seul le hash est gardé", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, userId } = await obtainAccessToken(app);
        const spaceId = await personalSpaceOf(db, userId);
        await switchToTeam(db, spaceId);
        const before = Date.now();

        const response = await invite(app, { accessToken, spaceId });
        const body = await response.json();
        const stored = await db.orm
          .select({ tokenHash: schema.spaceInvitation.tokenHash })
          .from(schema.spaceInvitation);
        const [email] = outbox.sent;

        expect(response.status).toBe(201);
        expect(body).toEqual({
          id: expect.any(String),
          email: GRACE,
          expiresAt: expect.any(String),
        });
        expect(Date.parse(body.expiresAt) - before).toBeGreaterThanOrEqual(7 * DAY_MS);
        expect(Date.parse(body.expiresAt) - Date.now()).toBeLessThanOrEqual(7 * DAY_MS);
        expect(outbox.sent).toEqual([
          {
            to: GRACE,
            subject: "Invitation à rejoindre « Ada Lovelace » sur dezyn",
            text: [
              "Vous êtes invité à rejoindre l'espace « Ada Lovelace » sur dezyn, en tant qu'éditeur.",
              "",
              `Acceptez l'invitation dans les 7 jours : ${WEB_URL}/invitations/${tokenOf(email)}`,
              "",
              "Ce lien ne sert qu'une fois.",
            ].join("\n"),
          },
        ]);
        expect(stored).toEqual([{ tokenHash: hashOf(tokenOf(email)) }]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("chaque invitation porte son propre lien", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, userId } = await obtainAccessToken(app);
        const spaceId = await personalSpaceOf(db, userId);
        await switchToTeam(db, spaceId);

        await invite(app, { accessToken, spaceId, email: GRACE });
        await invite(app, { accessToken, spaceId, email: "alan@dezyn.test" });
        const [first, second] = outbox.sent.map(tokenOf);

        expect(first).not.toBe("");
        expect(first).not.toBe(second);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un éditeur reçoit 403, sans email envoyé", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, userId } = await obtainAccessToken(app);
        const spaceId = await seedTeamSpaceWith(db, { userId, role: "editor" });

        const response = await invite(app, { accessToken, spaceId });

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({
          type: "about:blank",
          title: "Accès refusé",
          status: 403,
        });
        expect(outbox.sent).toEqual([]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un espace Free répond 403 avec un type qui nomme le plan requis", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, userId } = await obtainAccessToken(app);
        const spaceId = await personalSpaceOf(db, userId);

        const response = await invite(app, { accessToken, spaceId });

        expect(response.status).toBe(403);
        expect(response.headers.get("content-type")).toBe("application/problem+json");
        expect(await response.json()).toMatchObject({
          type: PLAN_REQUIRED,
          title: "Plan Team requis",
          status: 403,
          requiredPlan: "team",
        });
        expect(outbox.sent).toEqual([]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un non-membre reçoit 404", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await obtainAccessToken(app);
      const othersSpace = await seedTeamSpace(db);

      const response = await invite(app, { accessToken, spaceId: othersSpace });

      expect(response.status).toBe(404);
    }));

  it("un identifiant d'espace qui n'est pas un UUID reçoit 404", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await invite(app, { accessToken, spaceId: "pas-un-uuid" });

      expect(response.status).toBe(404);
    }));

  it("un email invalide répond 400", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);
      await switchToTeam(db, spaceId);

      const response = await invite(app, { accessToken, spaceId, email: "pas-un-email" });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ errors: [{ path: "email" }] });
    }));
});
