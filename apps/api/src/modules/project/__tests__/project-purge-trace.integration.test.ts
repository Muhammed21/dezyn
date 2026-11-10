import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { seedPurgeTrace } from "#testing/project-storage.ts";

const PURGED_AT = new Date("2026-11-10T08:00:00.000Z");

const listProjectsByApi = async (
  app: App,
  { accessToken, spaceId }: { readonly accessToken: string; readonly spaceId: string },
) => {
  const response = await app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return response.json();
};

const listProjectsByMcp = async (
  app: App,
  { accessToken, spaceId }: { readonly accessToken: string; readonly spaceId: string },
) => {
  const response = await callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name: "list_projects", arguments: { spaceId } },
    correlationId: "liste-des-projets",
  });
  const { result } = await response.json();
  return result;
};

describe("un projet dit quand son historique a été purgé pour la dernière fois (ADR 0042 §6)", () => {
  it("un projet jamais purgé renvoie historyPurgedAt à null, par l'API et par le MCP", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId, spaceId } = await seedProject(app, db);

      expect(await listProjectsByApi(app, { accessToken, spaceId })).toEqual({
        projects: [expect.objectContaining({ id: projectId, historyPurgedAt: null })],
      });
      expect((await listProjectsByMcp(app, { accessToken, spaceId })).structuredContent).toEqual({
        projects: [expect.objectContaining({ id: projectId, historyPurgedAt: null })],
      });
    }));

  it("un projet purgé renvoie la date de sa dernière purge, par l'API et par le MCP", () =>
    withIdentityApp(async (app, db, { migratorUrl }) => {
      const { accessToken, projectId, spaceId } = await seedProject(app, db);
      await seedPurgeTrace(migratorUrl, {
        projectId,
        purgedBefore: new Date("2026-10-24T13:57:39.007Z"),
        purgedAt: PURGED_AT,
      });

      const listed = await listProjectsByMcp(app, { accessToken, spaceId });

      expect(await listProjectsByApi(app, { accessToken, spaceId })).toEqual({
        projects: [
          expect.objectContaining({ id: projectId, historyPurgedAt: PURGED_AT.toISOString() }),
        ],
      });
      expect(listed.isError).toBeUndefined();
      expect(listed.structuredContent).toEqual({
        projects: [
          expect.objectContaining({ id: projectId, historyPurgedAt: PURGED_AT.toISOString() }),
        ],
      });
      expect(JSON.parse(listed.content[0].text)).toEqual(listed.structuredContent);
    }));
});
