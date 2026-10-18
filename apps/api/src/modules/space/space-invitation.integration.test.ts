import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { schema } from "@repo/db";

import {
  GRACE,
  obtainAccessToken,
  WEB_URL,
  withIdentityApp,
} from "../../testing/authorization-flow.ts";
import {
  hashOf,
  invite,
  makeOutbox,
  personalSpaceOf,
  seedTeamSpace,
  seedTeamSpaceWith,
  switchToTeam,
  tokenOf,
} from "../../testing/space-fixtures.ts";

const DAY_MS = 86_400_000;
const PLAN_REQUIRED = "https://dezyn.app/problems/plan-required";

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
          email: GRACE.email,
          expiresAt: expect.any(String),
        });
        expect(Date.parse(body.expiresAt) - before).toBeGreaterThanOrEqual(7 * DAY_MS);
        expect(Date.parse(body.expiresAt) - Date.now()).toBeLessThanOrEqual(7 * DAY_MS);
        expect(outbox.sent).toEqual([
          {
            to: GRACE.email,
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

        await invite(app, { accessToken, spaceId, email: GRACE.email });
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

  it("inviter un membre actif répond 409, sans invitation ni email", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, userId } = await obtainAccessToken(app);
        const spaceId = await personalSpaceOf(db, userId);
        await switchToTeam(db, spaceId);

        const response = await invite(app, { accessToken, spaceId, email: "Ada@Dezyn.TEST" });

        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          type: "about:blank",
          title: "Déjà membre de l'espace",
          status: 409,
        });
        expect(await db.orm.select().from(schema.spaceInvitation)).toEqual([]);
        expect(outbox.sent).toEqual([]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un membre parti peut être réinvité", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, userId } = await obtainAccessToken(app);
        const spaceId = await personalSpaceOf(db, userId);
        await switchToTeam(db, spaceId);
        const grace = await obtainAccessToken(app, { user: GRACE });
        await db.orm.insert(schema.spaceMember).values({
          id: randomUUID(),
          spaceId,
          userId: grace.userId,
          role: "editor",
          joinedAt: new Date(),
          closedAt: new Date(),
          closedReason: "left",
        });

        const response = await invite(app, { accessToken, spaceId, email: GRACE.email });

        expect(response.status).toBe(201);
        expect(outbox.sent).toHaveLength(1);
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
