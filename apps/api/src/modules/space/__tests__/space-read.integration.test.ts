import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import {
  ADA,
  type App,
  BASE_URL,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { schema } from "@repo/db";

const getSpace = (app: App, { accessToken, spaceId }: { accessToken: string; spaceId: string }) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

const personalSpaceOf = async (db: PostgresDatabase, userId: string) => {
  const [membership] = await db.orm
    .select({ spaceId: schema.spaceMember.spaceId })
    .from(schema.spaceMember)
    .where(eq(schema.spaceMember.userId, userId));
  return membership?.spaceId ?? "";
};

const seedSpace = async (db: PostgresDatabase) => {
  const id = randomUUID();
  await db.orm
    .insert(schema.space)
    .values({ id, name: "Studio Grace", plan: "team", createdAt: new Date() });
  return id;
};

describe("lire un espace (ADR 0017 §3)", () => {
  it("un membre lit son espace, avec son rôle", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);

      const response = await getSpace(app, { accessToken, spaceId });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id: spaceId,
        name: ADA.name,
        plan: "free",
        role: "owner",
      });
    }));

  it("un non-membre reçoit 404, comme pour un espace qui n'existe pas", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await obtainAccessToken(app);
      const othersSpace = await seedSpace(db);

      const notMember = await getSpace(app, { accessToken, spaceId: othersSpace });
      const missing = await getSpace(app, { accessToken, spaceId: randomUUID() });

      expect([notMember.status, missing.status]).toEqual([404, 404]);
      expect(await notMember.json()).toMatchObject({
        type: "about:blank",
        title: "Ressource introuvable",
        status: 404,
      });
    }));

  it("un membre parti reçoit 404", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);
      await db.orm
        .update(schema.spaceMember)
        .set({ closedAt: new Date(), closedReason: "left" })
        .where(eq(schema.spaceMember.userId, userId));

      const response = await getSpace(app, { accessToken, spaceId });

      expect(response.status).toBe(404);
    }));

  it("un identifiant qui n'est pas un UUID reçoit 404", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await getSpace(app, { accessToken, spaceId: "pas-un-uuid" });

      expect(response.status).toBe(404);
    }));
});
