import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { schema } from "@repo/db";

import type { PostgresDatabase } from "../../platform/postgres-database.ts";
import {
  ADA,
  type App,
  BASE_URL,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "../../testing/authorization-flow.ts";
import {
  hashOf,
  invite,
  makeOutbox,
  personalSpaceOf,
  switchToTeam,
  tokenOf,
} from "../../testing/space-fixtures.ts";

const PLAN_REQUIRED = "https://dezyn.app/problems/plan-required";

const accept = (app: App, { accessToken, token }: { accessToken: string; token: string }) =>
  app.request(`${BASE_URL}/v1/invitations/${token}/accept`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });

const listSpaces = async (app: App, accessToken: string) => {
  const response = await app.request(`${BASE_URL}/v1/spaces`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return response.json();
};

const inviteIntoTeamSpace = async (
  app: App,
  db: PostgresDatabase,
  outbox: ReturnType<typeof makeOutbox>,
  { email = GRACE.email }: { email?: string } = {},
) => {
  const ada = await obtainAccessToken(app);
  const spaceId = await personalSpaceOf(db, ada.userId);
  await switchToTeam(db, spaceId);
  await invite(app, { accessToken: ada.accessToken, spaceId, email });
  return { ada, spaceId, token: tokenOf(outbox.sent.at(-1)) };
};

const expire = (db: PostgresDatabase, token: string) =>
  db.orm
    .update(schema.spaceInvitation)
    .set({ expiresAt: new Date(Date.now() - 1_000) })
    .where(eq(schema.spaceInvitation.tokenHash, hashOf(token)));

const switchToFree = (db: PostgresDatabase, spaceId: string) =>
  db.orm.update(schema.space).set({ plan: "free" }).where(eq(schema.space.id, spaceId));

const leave = (db: PostgresDatabase, { spaceId, userId }: { spaceId: string; userId: string }) =>
  db.orm
    .update(schema.spaceMember)
    .set({ closedAt: new Date(), closedReason: "left" })
    .where(and(eq(schema.spaceMember.spaceId, spaceId), eq(schema.spaceMember.userId, userId)));

const membershipsOf = (
  db: PostgresDatabase,
  { spaceId, userId }: { spaceId: string; userId: string },
) =>
  db.orm
    .select({ role: schema.spaceMember.role, closedReason: schema.spaceMember.closedReason })
    .from(schema.spaceMember)
    .where(and(eq(schema.spaceMember.spaceId, spaceId), eq(schema.spaceMember.userId, userId)))
    .orderBy(schema.spaceMember.joinedAt);

const acceptedAtOf = async (db: PostgresDatabase, token: string) => {
  const [invitation] = await db.orm
    .select({ acceptedAt: schema.spaceInvitation.acceptedAt })
    .from(schema.spaceInvitation)
    .where(eq(schema.spaceInvitation.tokenHash, hashOf(token)));
  return invitation?.acceptedAt;
};

describe("l'invité accepte l'invitation et devient éditeur (ADR 0011 §4, ADR 0017)", () => {
  it("une invitation valide fait de l'invité un éditeur, qui voit l'espace", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { spaceId, token } = await inviteIntoTeamSpace(app, db, outbox);
        const grace = await obtainAccessToken(app, { user: GRACE });

        const response = await accept(app, { accessToken: grace.accessToken, token });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          id: spaceId,
          name: ADA.name,
          plan: "team",
          role: "editor",
        });
        expect((await listSpaces(app, grace.accessToken)).spaces).toContainEqual({
          id: spaceId,
          name: ADA.name,
          plan: "team",
          role: "editor",
        });
      },
      { mailer: outbox.mailer },
    );
  });

  it("une invitation déjà acceptée répond 410", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { token } = await inviteIntoTeamSpace(app, db, outbox);
        const grace = await obtainAccessToken(app, { user: GRACE });
        await accept(app, { accessToken: grace.accessToken, token });

        const reused = await accept(app, { accessToken: grace.accessToken, token });

        expect(reused.status).toBe(410);
        expect(reused.headers.get("content-type")).toBe("application/problem+json");
        expect(await reused.json()).toMatchObject({
          type: "about:blank",
          title: "Invitation expirée ou déjà utilisée",
          status: 410,
        });
      },
      { mailer: outbox.mailer },
    );
  });

  it("une invitation expirée répond 410, sans créer de membre", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { spaceId, token } = await inviteIntoTeamSpace(app, db, outbox);
        await expire(db, token);
        const grace = await obtainAccessToken(app, { user: GRACE });

        const response = await accept(app, { accessToken: grace.accessToken, token });

        expect(response.status).toBe(410);
        expect(await membershipsOf(db, { spaceId, userId: grace.userId })).toEqual([]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un jeton inconnu répond 410", () =>
    withIdentityApp(async (app) => {
      const grace = await obtainAccessToken(app, { user: GRACE });

      const response = await accept(app, {
        accessToken: grace.accessToken,
        token: "jeton-que-personne-n-a-envoye",
      });

      expect(response.status).toBe(410);
    }));

  it("un utilisateur dont l'email diffère de l'invitation reçoit 403, et l'invitation reste valable", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { spaceId, token } = await inviteIntoTeamSpace(app, db, outbox, {
          email: "alan@dezyn.test",
        });
        const grace = await obtainAccessToken(app, { user: GRACE });

        const response = await accept(app, { accessToken: grace.accessToken, token });

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({
          type: "about:blank",
          title: "Invitation adressée à un autre email",
          status: 403,
        });
        expect(await membershipsOf(db, { spaceId, userId: grace.userId })).toEqual([]);
        expect(await acceptedAtOf(db, token)).toBeNull();
      },
      { mailer: outbox.mailer },
    );
  });

  it("l'email de l'invitation se compare sans tenir compte de la casse", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { token } = await inviteIntoTeamSpace(app, db, outbox, {
          email: "Grace@Dezyn.TEST",
        });
        const grace = await obtainAccessToken(app, { user: GRACE });

        const response = await accept(app, { accessToken: grace.accessToken, token });

        expect(response.status).toBe(200);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un membre actif de l'espace reçoit 409, et l'invitation reste valable", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, spaceId, token: first } = await inviteIntoTeamSpace(app, db, outbox);
        await invite(app, { accessToken: ada.accessToken, spaceId });
        const token = tokenOf(outbox.sent.at(-1));
        const grace = await obtainAccessToken(app, { user: GRACE });
        await accept(app, { accessToken: grace.accessToken, token: first });

        const response = await accept(app, { accessToken: grace.accessToken, token });

        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          type: "about:blank",
          title: "Déjà membre de l'espace",
          status: 409,
        });
        expect(await membershipsOf(db, { spaceId, userId: grace.userId })).toEqual([
          { role: "editor", closedReason: null },
        ]);
        expect(await acceptedAtOf(db, token)).toBeNull();
      },
      { mailer: outbox.mailer },
    );
  });

  it("un espace repassé en Free répond 403 avec le plan requis, sans créer de membre", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { spaceId, token } = await inviteIntoTeamSpace(app, db, outbox);
        await switchToFree(db, spaceId);
        const grace = await obtainAccessToken(app, { user: GRACE });

        const response = await accept(app, { accessToken: grace.accessToken, token });

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({
          type: PLAN_REQUIRED,
          title: "Plan Team requis",
          status: 403,
          requiredPlan: "team",
        });
        expect(await membershipsOf(db, { spaceId, userId: grace.userId })).toEqual([]);
      },
      { mailer: outbox.mailer },
    );
  });
});

describe("un membre parti puis réinvité retrouve une ligne ouverte (ADR 0017)", () => {
  it("sa ligne fermée garde la raison left, une nouvelle ligne éditeur s'ouvre", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, spaceId, token } = await inviteIntoTeamSpace(app, db, outbox);
        const grace = await obtainAccessToken(app, { user: GRACE });
        await accept(app, { accessToken: grace.accessToken, token });
        await leave(db, { spaceId, userId: grace.userId });
        await invite(app, { accessToken: ada.accessToken, spaceId });

        const response = await accept(app, {
          accessToken: grace.accessToken,
          token: tokenOf(outbox.sent.at(-1)),
        });

        expect(response.status).toBe(200);
        expect(await membershipsOf(db, { spaceId, userId: grace.userId })).toEqual([
          { role: "editor", closedReason: "left" },
          { role: "editor", closedReason: null },
        ]);
      },
      { mailer: outbox.mailer },
    );
  });
});
