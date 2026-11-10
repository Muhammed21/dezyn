import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { seedPurgeTrace } from "#testing/project-storage.ts";

const PURGED_BEFORE = new Date("2026-10-24T13:57:39.007Z");

const PURGED_AT = new Date("2026-11-10T08:00:00.000Z");

const readHistoryByApi = async (
  app: App,
  {
    accessToken,
    projectId,
    query = "",
  }: { readonly accessToken: string; readonly projectId: string; readonly query?: string },
) => {
  const response = await app.request(`${BASE_URL}/v1/projects/${projectId}/history${query}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return response.json();
};

const readHistoryByMcp = async (
  app: App,
  {
    accessToken,
    projectId,
    cursor,
  }: { readonly accessToken: string; readonly projectId: string; readonly cursor?: string },
) => {
  const response = await callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name: "read_history", arguments: { projectId, limit: 1, cursor } },
    correlationId: "lecture-de-la-purge",
  });
  const { result } = await response.json();
  return result;
};

const listTools = async (app: App, accessToken: string) => {
  const response = await callMcp(app, {
    token: accessToken,
    method: "tools/list",
    params: {},
    correlationId: "outils",
  });
  const { result } = await response.json();
  return result.tools;
};

describe("l'historique d'un projet dit jusqu'à quelle date il a été purgé (ADR 0042 §6)", () => {
  it("un projet jamais purgé renvoie purgedBefore à null, par l'API et par le MCP", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      expect(await readHistoryByApi(app, { accessToken, projectId })).toMatchObject({
        purgedBefore: null,
      });
      expect(
        (await readHistoryByMcp(app, { accessToken, projectId })).structuredContent,
      ).toMatchObject({ purgedBefore: null });
    }));

  it("un projet purgé renvoie la date de la plus récente entrée purgée sur chaque page de l'API", () =>
    withIdentityApp(async (app, db, { migratorUrl }) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await readHistoryByMcp(app, { accessToken, projectId });
      await seedPurgeTrace(migratorUrl, {
        projectId,
        purgedBefore: PURGED_BEFORE,
        purgedAt: PURGED_AT,
      });

      const first = await readHistoryByApi(app, { accessToken, projectId, query: "?limit=1" });
      const next = await readHistoryByApi(app, {
        accessToken,
        projectId,
        query: `?limit=1&cursor=${first.nextCursor}`,
      });

      expect(first).toMatchObject({ purgedBefore: PURGED_BEFORE.toISOString() });
      expect(next).toMatchObject({
        entries: [expect.objectContaining({ action: "project.created" })],
        purgedBefore: PURGED_BEFORE.toISOString(),
      });
    }));

  it("read_history renvoie la même date, sur chaque page, dans une sortie conforme à son schéma", () =>
    withIdentityApp(async (app, db, { migratorUrl }) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await readHistoryByMcp(app, { accessToken, projectId });
      await seedPurgeTrace(migratorUrl, {
        projectId,
        purgedBefore: PURGED_BEFORE,
        purgedAt: PURGED_AT,
      });

      const first = await readHistoryByMcp(app, { accessToken, projectId });
      const next = await readHistoryByMcp(app, {
        accessToken,
        projectId,
        cursor: first.structuredContent.nextCursor,
      });

      expect(first.isError).toBeUndefined();
      expect(first.structuredContent.purgedBefore).toBe(PURGED_BEFORE.toISOString());
      expect(JSON.parse(first.content[0].text)).toEqual(first.structuredContent);
      expect(next.structuredContent.purgedBefore).toBe(PURGED_BEFORE.toISOString());
    }));

  it("read_history annonce purgedBefore dans sa description et son schéma de sortie", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await seedProject(app, db);

      const readHistory = (await listTools(app, accessToken)).find(
        ({ name }: { name: string }) => name === "read_history",
      );

      expect(readHistory.description).toContain(
        "purgedBefore : les entrées antérieures à cette date ont été supprimées par la purge du stockage",
      );
      expect(readHistory.outputSchema.properties.purgedBefore).toBeDefined();
      expect(readHistory.outputSchema.required).toContain("purgedBefore");
    }));
});
