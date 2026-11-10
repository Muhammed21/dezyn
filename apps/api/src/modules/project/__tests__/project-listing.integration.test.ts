import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  type App,
  BASE_URL,
  callMcp,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { personalSpaceOf } from "#testing/space-fixtures.ts";

const createProject = async (
  app: App,
  { accessToken, spaceId, name }: { accessToken: string; spaceId: string; name: string },
) => {
  const created = await app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return created.json();
};

const listProjects = (
  app: App,
  { accessToken, spaceId }: { accessToken: string; spaceId: string },
) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

const callListProjects = async (
  app: App,
  { accessToken, spaceId }: { accessToken: string; spaceId: unknown },
) => {
  const response = await callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name: "list_projects", arguments: { spaceId } },
  });
  const { result } = await response.json();
  return result;
};

describe("un membre liste les projets d'un espace (ADR 0025)", () => {
  it("rend les projets de l'espace triés par nom, avec leur date de création", () =>
    withIdentityApp(async (app, db) => {
      const owner = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, owner.userId);
      const vitrine = await createProject(app, { ...owner, spaceId, name: "Site vitrine" });
      const boutique = await createProject(app, { ...owner, spaceId, name: "Boutique" });

      const listed = await listProjects(app, { ...owner, spaceId });

      expect(listed.status).toBe(200);
      expect(await listed.json()).toEqual({
        projects: [
          { id: boutique.id, name: "Boutique", createdAt: expect.any(String) },
          { id: vitrine.id, name: "Site vitrine", createdAt: expect.any(String) },
        ],
      });
    }));

  it("un non-membre et un espace inconnu reçoivent la même réponse", () =>
    withIdentityApp(async (app, db) => {
      const owner = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, owner.userId);
      await createProject(app, { ...owner, spaceId, name: "Site vitrine" });
      const stranger = await obtainAccessToken(app, { user: GRACE });

      const forbidden = await listProjects(app, { ...stranger, spaceId });
      const unknown = await listProjects(app, { ...owner, spaceId: randomUUID() });
      const malformed = await listProjects(app, { ...owner, spaceId: "pas-un-uuid" });

      expect([forbidden.status, unknown.status, malformed.status]).toEqual([404, 404, 404]);
    }));
});

describe("l'IA liste les projets d'un espace par le MCP (ADR 0025)", () => {
  it("list_projects rend les projets de l'espace, triés par nom", () =>
    withIdentityApp(async (app, db) => {
      const owner = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, owner.userId);
      const vitrine = await createProject(app, { ...owner, spaceId, name: "Site vitrine" });
      const boutique = await createProject(app, { ...owner, spaceId, name: "Boutique" });

      const result = await callListProjects(app, { ...owner, spaceId });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        projects: [
          { id: boutique.id, name: "Boutique", createdAt: expect.any(String) },
          { id: vitrine.id, name: "Site vitrine", createdAt: expect.any(String) },
        ],
      });
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    }));

  it("tools/list annonce list_projects, son entrée spaceId et sa sortie", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const tools = await callMcp(app, { token: accessToken, method: "tools/list" });

      expect(await tools.json()).toMatchObject({
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "list_projects",
              description:
                "Liste les projets d'un espace dont l'utilisateur est membre, triés par nom, avec leur id et leur date de création. Les espaces viennent de list_spaces.",
              inputSchema: expect.objectContaining({ required: ["spaceId"] }),
              outputSchema: expect.objectContaining({
                properties: { projects: expect.anything() },
              }),
            }),
          ]),
        },
      });
    }));

  it("un non-membre reçoit une erreur, comme pour un espace inconnu", () =>
    withIdentityApp(async (app, db) => {
      const owner = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, owner.userId);
      const stranger = await obtainAccessToken(app, { user: GRACE });

      const forbidden = await callListProjects(app, { ...stranger, spaceId });
      const unknown = await callListProjects(app, { ...owner, spaceId: randomUUID() });

      expect([forbidden, unknown]).toEqual([
        { content: [{ type: "text", text: "Espace introuvable" }], isError: true },
        { content: [{ type: "text", text: "Espace introuvable" }], isError: true },
      ]);
    }));

  it("lister les projets ne laisse pas d'entrée dans l'historique d'un projet", () =>
    withIdentityApp(async (app, db) => {
      const owner = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, owner.userId);
      const vitrine = await createProject(app, { ...owner, spaceId, name: "Site vitrine" });

      await callListProjects(app, { ...owner, spaceId });
      const history = await app.request(`${BASE_URL}/v1/projects/${vitrine.id}/history`, {
        headers: { authorization: `Bearer ${owner.accessToken}` },
      });
      const { entries } = await history.json();

      expect(entries.map(({ action }: { action: string }) => action)).toEqual(["project.created"]);
    }));
});
