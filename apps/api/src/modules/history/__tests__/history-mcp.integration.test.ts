import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import {
  ADA,
  type App,
  BASE_URL,
  callMcp,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { schema } from "@repo/db";

const CORRELATION_ID = "lecture-par-l-ia-1";

const readHistoryByApi = async (
  app: App,
  {
    accessToken,
    projectId,
    query = "",
  }: { accessToken: string; projectId: string; query?: string },
) => {
  const response = await app.request(`${BASE_URL}/v1/projects/${projectId}/history${query}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return response.json();
};

const callTool = async (
  app: App,
  { token, name, args }: { token: string; name: string; args: object },
) => {
  const response = await callMcp(app, {
    token,
    method: "tools/call",
    params: { name, arguments: args },
    correlationId: CORRELATION_ID,
  });
  const { result } = await response.json();
  return result;
};

const entriesOf = (db: PostgresDatabase, projectId: string) =>
  db.orm
    .select({ action: schema.historyEntry.action })
    .from(schema.historyEntry)
    .where(eq(schema.historyEntry.projectId, projectId));

describe("l'IA lit l'historique d'un projet par le MCP (ADR 0004 §3, ADR 0021 §1)", () => {
  it("read_history rend la même page que la route d'API", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const api = await readHistoryByApi(app, { accessToken, projectId, query: "?limit=1" });

      const result = await callTool(app, {
        token: accessToken,
        name: "read_history",
        args: { projectId, limit: 1 },
      });

      expect(result).toMatchObject({
        structuredContent: api,
        content: [{ type: "text", text: JSON.stringify(api) }],
      });
    }));

  it("read_history suit le curseur de la page suivante comme la route d'API", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await callTool(app, { token: accessToken, name: "read_history", args: { projectId } });
      const first = await readHistoryByApi(app, { accessToken, projectId, query: "?limit=1" });
      const second = await readHistoryByApi(app, {
        accessToken,
        projectId,
        query: `?limit=1&cursor=${first.nextCursor}`,
      });

      const result = await callTool(app, {
        token: accessToken,
        name: "read_history",
        args: { projectId, limit: 1, cursor: first.nextCursor },
      });

      expect(result.structuredContent).toEqual(second);
    }));

  it("sans limit, read_history rend une page de 50 entrées, comme la route d'API", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await Array.from({ length: 50 }).reduce<Promise<unknown>>(
        (previous) =>
          previous.then(() =>
            callTool(app, {
              token: accessToken,
              name: "read_history",
              args: { projectId, limit: 1 },
            }),
          ),
        Promise.resolve(),
      );
      const api = await readHistoryByApi(app, { accessToken, projectId });

      const result = await callTool(app, {
        token: accessToken,
        name: "read_history",
        args: { projectId },
      });

      expect(api.entries).toHaveLength(50);
      expect(result.structuredContent).toEqual(api);
    }));

  it("annonce read_history avec sa description et ses schémas", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await callMcp(app, { token: accessToken, method: "tools/list" });

      expect(await response.json()).toMatchObject({
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "read_history",
              description:
                "Lit l'historique d'un projet, des entrées les plus récentes aux plus anciennes, page par page : renvoyer nextCursor en cursor pour la page suivante.",
              inputSchema: expect.objectContaining({
                required: ["projectId"],
                properties: expect.objectContaining({
                  projectId: expect.anything(),
                  cursor: expect.anything(),
                  limit: expect.objectContaining({ minimum: 1, maximum: 100 }),
                }),
              }),
              outputSchema: expect.objectContaining({
                properties: expect.objectContaining({ entries: expect.anything() }),
              }),
            }),
          ]),
        },
      });
    }));

  it("l'appel laisse une entrée qui référence l'auteur, le client OAuth, le résultat et la corrélation", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, clientId, userId, spaceId, projectId } = await seedProject(app, db);

      await callTool(app, {
        token: accessToken,
        name: "read_history",
        args: { projectId, limit: 5 },
      });
      const { entries } = await readHistoryByApi(app, { accessToken, projectId });

      expect(entries[0]).toEqual({
        id: expect.any(String),
        action: "mcp.read_history",
        spaceId,
        projectId,
        author: { kind: "member", userId, name: ADA.name, membership: "active" },
        clientId,
        before: null,
        after: { outcome: "success", input: { limit: 5 } },
        occurredAt: expect.any(String),
        correlationId: CORRELATION_ID,
      });
    }));

  it("un curseur invalide rend une erreur d'outil et laisse une entrée en échec", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await callTool(app, {
        token: accessToken,
        name: "read_history",
        args: { projectId, cursor: "pas-un-curseur" },
      });
      const { entries } = await readHistoryByApi(app, { accessToken, projectId });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "Curseur invalide" }],
      });
      expect(entries[0]).toMatchObject({
        action: "mcp.read_history",
        after: { outcome: "error", input: { cursor: "pas-un-curseur" } },
      });
    }));

  it("un non-membre reçoit une erreur, sans entrée dans l'historique du projet", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await seedProject(app, db);
      const grace = await obtainAccessToken(app, { user: GRACE });

      const result = await callTool(app, {
        token: grace.accessToken,
        name: "read_history",
        args: { projectId },
      });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "Projet introuvable" }],
      });
      expect(await entriesOf(db, projectId)).toEqual([{ action: "project.created" }]);
    }));

  it("un projet inconnu rend une erreur, sans entrée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await seedProject(app, db);

      const result = await callTool(app, {
        token: accessToken,
        name: "read_history",
        args: { projectId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b" },
      });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "Projet introuvable" }],
      });
      expect(await db.orm.select().from(schema.historyEntry)).toHaveLength(1);
    }));

  it("si l'entrée ne peut pas être écrite, l'outil rend une erreur au lieu de la page", () =>
    withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);

        const result = await callTool(app, {
          token: accessToken,
          name: "read_history",
          args: { projectId },
        });

        expect(result).toMatchObject({
          isError: true,
          content: [{ type: "text", text: "Historique indisponible" }],
        });
        expect(result.structuredContent).toBeUndefined();
      },
      {
        wrapHistoryWriter: (writer) => ({
          append: (entry) =>
            entry.action.startsWith("mcp.")
              ? Promise.reject(new Error("historique indisponible"))
              : writer.append(entry),
        }),
      },
    ));
});

describe("tout outil qui vise un projet entre dans l'historique (ADR 0021, risques ; ADR 0025)", () => {
  it("chaque outil dont l'entrée a un projectId laisse une entrée quand il vise un projet", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const listed = await (
        await callMcp(app, { token: accessToken, method: "tools/list" })
      ).json();
      const projectTools: readonly string[] = listed.result.tools
        .filter((tool: { inputSchema: { properties?: object } }) =>
          Object.hasOwn(tool.inputSchema.properties ?? {}, "projectId"),
        )
        .map((tool: { name: string }) => tool.name);

      const written = await projectTools.reduce<Promise<readonly string[]>>(
        async (previous, name) => {
          const done = await previous;
          await callTool(app, { token: accessToken, name, args: { projectId } });
          return [...done, name];
        },
        Promise.resolve([]),
      );
      const actions = (await entriesOf(db, projectId)).map((entry) => entry.action);

      expect(projectTools).toContain("read_history");
      expect(actions.toSorted((left, right) => left.localeCompare(right))).toEqual(
        ["project.created", ...written.map((name) => `mcp.${name}`)].toSorted((left, right) =>
          left.localeCompare(right),
        ),
      );
    }));
});
