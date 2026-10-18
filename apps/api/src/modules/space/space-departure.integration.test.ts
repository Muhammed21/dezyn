import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { schema } from "@repo/db";

import type { PostgresDatabase } from "../../platform/postgres-database.ts";
import {
  type App,
  BASE_URL,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "../../testing/authorization-flow.ts";
import {
  invite,
  makeOutbox,
  personalSpaceOf,
  seedTeamSpace,
  switchToTeam,
  tokenOf,
} from "../../testing/space-fixtures.ts";

const LAST_OWNER = "https://dezyn.app/problems/last-owner";

const leave = (app: App, { accessToken, spaceId }: { accessToken: string; spaceId: string }) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/members/me`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  });

const readSpace = (app: App, { accessToken, spaceId }: { accessToken: string; spaceId: string }) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

const seedAdaSpaceWithGrace = async (
  app: App,
  db: PostgresDatabase,
  outbox: ReturnType<typeof makeOutbox>,
) => {
  const ada = await obtainAccessToken(app);
  const spaceId = await personalSpaceOf(db, ada.userId);
  await switchToTeam(db, spaceId);
  await invite(app, { accessToken: ada.accessToken, spaceId });
  const grace = await obtainAccessToken(app, { user: GRACE });
  await app.request(`${BASE_URL}/v1/invitations/${tokenOf(outbox.sent.at(-1))}/accept`, {
    method: "POST",
    headers: { authorization: `Bearer ${grace.accessToken}` },
  });
  return { ada, grace, spaceId };
};

const promoteToOwner = (
  db: PostgresDatabase,
  { spaceId, userId }: { spaceId: string; userId: string },
) =>
  db.orm
    .update(schema.spaceMember)
    .set({ role: "owner" })
    .where(and(eq(schema.spaceMember.spaceId, spaceId), eq(schema.spaceMember.userId, userId)));

const membershipsOf = (
  db: PostgresDatabase,
  { spaceId, userId }: { spaceId: string; userId: string },
) =>
  db.orm
    .select({
      role: schema.spaceMember.role,
      closedAt: schema.spaceMember.closedAt,
      closedReason: schema.spaceMember.closedReason,
    })
    .from(schema.spaceMember)
    .where(and(eq(schema.spaceMember.spaceId, spaceId), eq(schema.spaceMember.userId, userId)));

const openOwnersOf = (db: PostgresDatabase, spaceId: string) =>
  db.orm
    .select({ userId: schema.spaceMember.userId })
    .from(schema.spaceMember)
    .where(
      and(
        eq(schema.spaceMember.spaceId, spaceId),
        eq(schema.spaceMember.role, "owner"),
        isNull(schema.spaceMember.closedAt),
      ),
    );

describe("un membre quitte l'espace, sauf le dernier propriétaire (ADR 0011 §5, ADR 0017 §2)", () => {
  it("un éditeur qui part garde sa ligne, fermée avec la raison left, et perd l'accès", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { grace, spaceId } = await seedAdaSpaceWithGrace(app, db, outbox);
        const before = Date.now();

        const response = await leave(app, { accessToken: grace.accessToken, spaceId });

        expect(response.status).toBe(204);
        expect(await response.text()).toBe("");
        const [membership] = await membershipsOf(db, { spaceId, userId: grace.userId });
        expect(membership).toMatchObject({ role: "editor", closedReason: "left" });
        expect(membership?.closedAt?.getTime()).toBeGreaterThanOrEqual(before);
        expect((await readSpace(app, { accessToken: grace.accessToken, spaceId })).status).toBe(
          404,
        );
      },
      { mailer: outbox.mailer },
    );
  });

  it("un membre déjà parti reçoit 404", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { grace, spaceId } = await seedAdaSpaceWithGrace(app, db, outbox);
        await leave(app, { accessToken: grace.accessToken, spaceId });

        const again = await leave(app, { accessToken: grace.accessToken, spaceId });

        expect(again.status).toBe(404);
        expect(await membershipsOf(db, { spaceId, userId: grace.userId })).toHaveLength(1);
      },
      { mailer: outbox.mailer },
    );
  });

  it("le dernier propriétaire reçoit 409, avec un type qui nomme le cas, et reste membre", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);

      const response = await leave(app, { accessToken, spaceId });

      expect(response.status).toBe(409);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toMatchObject({
        type: LAST_OWNER,
        title: "Dernier propriétaire de l'espace",
        status: 409,
      });
      expect(await membershipsOf(db, { spaceId, userId })).toEqual([
        { role: "owner", closedAt: null, closedReason: null },
      ]);
    }));

  it("le dernier propriétaire reçoit 409 même quand un éditeur reste", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, spaceId } = await seedAdaSpaceWithGrace(app, db, outbox);

        const response = await leave(app, { accessToken: ada.accessToken, spaceId });

        expect(response.status).toBe(409);
        expect(await openOwnersOf(db, spaceId)).toEqual([{ userId: ada.userId }]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un propriétaire part quand un autre propriétaire reste", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedAdaSpaceWithGrace(app, db, outbox);
        await promoteToOwner(db, { spaceId, userId: grace.userId });

        const response = await leave(app, { accessToken: ada.accessToken, spaceId });

        expect(response.status).toBe(204);
        expect(await openOwnersOf(db, spaceId)).toEqual([{ userId: grace.userId }]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un non-membre reçoit 404", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await obtainAccessToken(app);
      const othersSpace = await seedTeamSpace(db);

      const response = await leave(app, { accessToken, spaceId: othersSpace });

      expect(response.status).toBe(404);
    }));

  it("un identifiant d'espace qui n'est pas un UUID reçoit 404", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await leave(app, { accessToken, spaceId: "pas-un-uuid" });

      expect(response.status).toBe(404);
    }));
});

describe("deux départs simultanés des deux derniers propriétaires (ADR 0017 §4)", () => {
  it("laissent un propriétaire : un départ passe, l'autre reçoit 409", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedAdaSpaceWithGrace(app, db, outbox);
        await promoteToOwner(db, { spaceId, userId: grace.userId });

        const responses = await Promise.all([
          leave(app, { accessToken: ada.accessToken, spaceId }),
          leave(app, { accessToken: grace.accessToken, spaceId }),
        ]);

        expect(responses.map((response) => response.status)).toEqual(
          expect.arrayContaining([204, 409]),
        );
        expect(await openOwnersOf(db, spaceId)).toHaveLength(1);
      },
      { mailer: outbox.mailer },
    );
  });
});
