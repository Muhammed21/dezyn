import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import {
  type App,
  BASE_URL,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { personalSpaceOf, switchToTeam } from "#testing/space-fixtures.ts";
import { schema } from "@repo/db";

const createProject = (
  app: App,
  {
    accessToken,
    spaceId,
    name = "Nouveau projet",
  }: { accessToken: string; spaceId: string; name?: string },
) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });

const seedProjects = async (
  db: PostgresDatabase,
  { spaceId, count }: { spaceId: string; count: number },
) => {
  for (const index of Array.from({ length: count }, (_, position) => position)) {
    await db.orm
      .insert(schema.project)
      .values({ id: randomUUID(), spaceId, name: `Projet ${index}`, createdAt: new Date() });
  }
};

const projectCountOf = async (db: PostgresDatabase, spaceId: string) =>
  (await db.orm.select().from(schema.project).where(eq(schema.project.spaceId, spaceId))).length;

const historyCountOf = async (db: PostgresDatabase, spaceId: string) =>
  (await db.orm.select().from(schema.historyEntry).where(eq(schema.historyEntry.spaceId, spaceId)))
    .length;

const seedFreeSpaceWithProjects = async (app: App, db: PostgresDatabase, count: number) => {
  const owner = await obtainAccessToken(app);
  const spaceId = await personalSpaceOf(db, owner.userId);
  await seedProjects(db, { spaceId, count });
  return { ...owner, spaceId };
};

const PLAN_REQUIRED = {
  type: "https://dezyn.dev/problems/plan-required",
  title: "Plan Team requis",
  status: 403,
  requiredPlan: "team",
  limit: 3,
};

describe("la création d'un projet respecte la limite de projets du plan (ADR 0006 §1, ADR 0011)", () => {
  it("un espace Free à 2 projets en crée un 3e", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, spaceId } = await seedFreeSpaceWithProjects(app, db, 2);

      const response = await createProject(app, { accessToken, spaceId });

      expect(response.status).toBe(201);
      expect(await projectCountOf(db, spaceId)).toBe(3);
    }));

  it("un espace Free à 3 projets reçoit plan-required, sans projet ni entrée d'historique", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, spaceId } = await seedFreeSpaceWithProjects(app, db, 3);

      const response = await createProject(app, { accessToken, spaceId });

      expect(response.status).toBe(403);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toMatchObject(PLAN_REQUIRED);
      expect(await projectCountOf(db, spaceId)).toBe(3);
      expect(await historyCountOf(db, spaceId)).toBe(0);
    }));

  it("un espace repassé en Free avec plus de 3 projets reçoit le même refus et garde ses projets", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, spaceId } = await seedFreeSpaceWithProjects(app, db, 5);

      const response = await createProject(app, { accessToken, spaceId });

      expect(await response.json()).toMatchObject(PLAN_REQUIRED);
      expect(await projectCountOf(db, spaceId)).toBe(5);
    }));

  it("un espace Team crée un projet au-delà de 3", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, spaceId } = await seedFreeSpaceWithProjects(app, db, 3);
      await switchToTeam(db, spaceId);

      const response = await createProject(app, { accessToken, spaceId });

      expect(response.status).toBe(201);
      expect(await projectCountOf(db, spaceId)).toBe(4);
    }));

  it("deux créations simultanées dans un espace Free à 2 projets : une seule passe", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, spaceId } = await seedFreeSpaceWithProjects(app, db, 2);

      const responses = await Promise.all([
        createProject(app, { accessToken, spaceId, name: "Premier" }),
        createProject(app, { accessToken, spaceId, name: "Second" }),
      ]);

      expect(responses.map(({ status }) => status).toSorted((left, right) => left - right)).toEqual(
        [201, 403],
      );
      expect(await projectCountOf(db, spaceId)).toBe(3);
    }));

  it("un membre sans le droit project.create reçoit forbidden, même dans un espace Free plein", () =>
    withIdentityApp(async (app, db) => {
      const { spaceId } = await seedFreeSpaceWithProjects(app, db, 3);
      const editor = await obtainAccessToken(app, { user: GRACE });
      await db.orm.insert(schema.spaceMember).values({
        id: randomUUID(),
        spaceId,
        userId: editor.userId,
        role: "editor",
        joinedAt: new Date(),
      });

      const response = await createProject(app, { accessToken: editor.accessToken, spaceId });

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ type: "about:blank", title: "Accès refusé" });
    }));
});
