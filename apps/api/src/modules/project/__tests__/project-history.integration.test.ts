import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { personalSpaceOf, seedTeamSpace, seedTeamSpaceWith } from "#testing/space-fixtures.ts";
import { schema } from "@repo/db";

const CORRELATION_ID = "creation-du-projet-1";

const createProject = (
  app: App,
  {
    accessToken,
    spaceId,
    name = "Site vitrine",
  }: { accessToken: string; spaceId: string; name?: string },
) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-correlation-id": CORRELATION_ID,
    },
    body: JSON.stringify({ name }),
  });

const readHistory = (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) =>
  app.request(`${BASE_URL}/v1/projects/${projectId}/history`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

describe("un propriétaire crée un projet, et l'historique du projet le montre (ADR 0004 §4, ADR 0025)", () => {
  it("le projet appartient à l'espace et son historique rend l'entrée project.created", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);
      const before = Date.now();

      const created = await createProject(app, { accessToken, spaceId });
      const project = await created.json();
      const history = await readHistory(app, { accessToken, projectId: project.id });

      expect(created.status).toBe(201);
      expect(project).toEqual({
        id: expect.any(String),
        spaceId,
        name: "Site vitrine",
        createdAt: expect.any(String),
      });
      expect(history.status).toBe(200);
      const { entries } = await history.json();
      expect(entries).toEqual([
        {
          id: expect.any(String),
          action: "project.created",
          spaceId,
          projectId: project.id,
          author: { kind: "member", userId, name: ADA.name, membership: "active" },
          clientId: null,
          before: null,
          after: { name: "Site vitrine" },
          occurredAt: project.createdAt,
          correlationId: CORRELATION_ID,
        },
      ]);
      expect(Date.parse(project.createdAt)).toBeGreaterThanOrEqual(before);
    }));

  it("si l'écriture de l'entrée échoue, le projet n'est pas créé", () =>
    withIdentityApp(
      async (app, db) => {
        const { accessToken, userId } = await obtainAccessToken(app);
        const spaceId = await personalSpaceOf(db, userId);

        const response = await createProject(app, { accessToken, spaceId });

        expect(response.status).toBe(500);
        expect(await db.orm.select().from(schema.project)).toEqual([]);
      },
      {
        wrapHistoryWriter: () => ({
          append: () => Promise.reject(new Error("historique indisponible")),
        }),
      },
    ));

  it("le nom est rogné, et un nom vide ou trop long répond 400", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);

      const trimmed = await createProject(app, { accessToken, spaceId, name: "  Site vitrine  " });
      const blank = await createProject(app, { accessToken, spaceId, name: "   " });
      const longest = await createProject(app, { accessToken, spaceId, name: "a".repeat(100) });
      const tooLong = await createProject(app, { accessToken, spaceId, name: "a".repeat(101) });

      expect(await trimmed.json()).toMatchObject({ name: "Site vitrine" });
      expect(blank.status).toBe(400);
      expect(longest.status).toBe(201);
      expect(tooLong.status).toBe(400);
      expect(await tooLong.json()).toMatchObject({ errors: [{ path: "name" }] });
    }));

  it("un éditeur reçoit 403, sans projet créé", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await seedTeamSpaceWith(db, { userId, role: "editor" });

      const response = await createProject(app, { accessToken, spaceId });

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Accès refusé",
        status: 403,
      });
      expect(await db.orm.select().from(schema.project)).toEqual([]);
    }));

  it("un non-membre reçoit 404 à la création", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await obtainAccessToken(app);
      const othersSpace = await seedTeamSpace(db);

      const response = await createProject(app, { accessToken, spaceId: othersSpace });

      expect(response.status).toBe(404);
      expect(await db.orm.select().from(schema.project)).toEqual([]);
    }));

  it("un identifiant d'espace qui n'est pas un UUID reçoit 404 à la création", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await createProject(app, { accessToken, spaceId: "pas-un-uuid" });

      expect(response.status).toBe(404);
    }));

  it("un non-membre de l'espace reçoit 404 sur l'historique du projet", () =>
    withIdentityApp(async (app, db) => {
      const ada = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, ada.userId);
      const { id: projectId } = await (
        await createProject(app, { accessToken: ada.accessToken, spaceId })
      ).json();
      const grace = await obtainAccessToken(app, { user: GRACE });

      const response = await readHistory(app, { accessToken: grace.accessToken, projectId });

      expect(response.status).toBe(404);
    }));

  it("un projet inconnu ou un identifiant qui n'est pas un UUID répond 404", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const unknown = await readHistory(app, {
        accessToken,
        projectId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
      });
      const notAUuid = await readHistory(app, { accessToken, projectId: "pas-un-uuid" });

      expect(unknown.status).toBe(404);
      expect(notAUuid.status).toBe(404);
    }));
});
