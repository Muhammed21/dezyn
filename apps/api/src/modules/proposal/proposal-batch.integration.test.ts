import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  type App,
  authorizeAnotherAi,
  GRACE,
  obtainAccessToken,
  BASE_URL,
  callMcp,
  refreshTokens,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { whileHolding } from "#testing/lock-wait.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { storageMeterOn } from "#testing/project-storage.ts";
import { historyOf, makeColorToken } from "#testing/token-fixtures.ts";

import { postgresProposalStore } from "./infrastructure/postgres-proposals.ts";

const INTENTION = "Import du Figma Healthcare";

const callTool = async (
  app: App,
  { token, name, args }: { token: string; name: string; args: object },
) => {
  const response = await callMcp(app, {
    token,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const { result } = await response.json();
  return result;
};

const openBatch = (
  app: App,
  { token, projectId, intent }: { token: string; projectId: string; intent?: string },
) => callTool(app, { token, name: "open_proposal_batch", args: { projectId, intent } });

const closeBatch = (app: App, { token, projectId }: { token: string; projectId: string }) =>
  callTool(app, { token, name: "close_proposal_batch", args: { projectId } });

const writeTokens = async (
  app: App,
  {
    token,
    projectId,
    name = "couleur.fond.primaire",
  }: { token: string; projectId: string; name?: string },
) =>
  (
    await callTool(app, {
      token,
      name: "write_tokens",
      args: { projectId, tokens: [makeColorToken({ name })] },
    })
  ).structuredContent;

const request = (app: App, { accessToken, path }: { accessToken: string; path: string }) =>
  app.request(`${BASE_URL}/v1${path}`, { headers: { authorization: `Bearer ${accessToken}` } });

const batchOf = async (
  app: App,
  { accessToken, batchId }: { accessToken: string; batchId: string },
) => (await request(app, { accessToken, path: `/proposal-batches/${batchId}` })).json();

const batchesOf = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) =>
  (
    await (
      await request(app, { accessToken, path: `/projects/${projectId}/proposal-batches` })
    ).json()
  ).batches;

const createProject = async (
  app: App,
  { accessToken, spaceId }: { accessToken: string; spaceId: string },
): Promise<string> => {
  const created = await app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "Application mobile" }),
  });
  const { id } = await created.json();
  return String(id);
};

describe("l'IA ouvre et ferme un lot avec son intention (ADR 0013 §1)", () => {
  it("le lot ouvert porte l'intention, reçoit les écritures suivantes, puis se ferme", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const opened = await openBatch(app, { token: accessToken, projectId, intent: INTENTION });
      const written = await writeTokens(app, { token: accessToken, projectId });
      const closed = await closeBatch(app, { token: accessToken, projectId });

      expect(opened.structuredContent).toEqual({
        batch: { id: expect.any(String), state: "open", intent: INTENTION },
        closed: null,
      });
      expect(opened.content).toEqual([
        { type: "text", text: JSON.stringify(opened.structuredContent) },
      ]);
      const batchId = opened.structuredContent.batch.id;
      expect(written.batch.id).toBe(batchId);
      expect(closed.structuredContent).toEqual({
        batch: { id: batchId, state: "closed", intent: INTENTION },
      });
      expect(await batchOf(app, { accessToken, batchId })).toMatchObject({
        id: batchId,
        intent: INTENTION,
        state: "closed",
        proposals: [{ name: "couleur.fond.primaire", status: "proposed" }],
      });
    }));

  it("après la fermeture, une écriture va dans un nouveau lot automatique, sans intention", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const opened = await openBatch(app, { token: accessToken, projectId, intent: INTENTION });
      await closeBatch(app, { token: accessToken, projectId });

      const written = await writeTokens(app, { token: accessToken, projectId });

      expect(written.batch.id).not.toBe(opened.structuredContent.batch.id);
      expect(await batchOf(app, { accessToken, batchId: written.batch.id })).toMatchObject({
        intent: null,
        state: "open",
      });
    }));

  it("ouvrir un lot alors qu'un lot automatique est ouvert ferme ce dernier", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const automatic = await writeTokens(app, { token: accessToken, projectId });

      const opened = await openBatch(app, { token: accessToken, projectId, intent: INTENTION });

      expect(opened.structuredContent.closed).toEqual({ id: automatic.batch.id });
      expect(await batchesOf(app, { accessToken, projectId })).toMatchObject([
        { id: opened.structuredContent.batch.id, intent: INTENTION, state: "open" },
        { id: automatic.batch.id, intent: null, state: "closed" },
      ]);
    }));

  it("ouvrir un second lot déclaré ferme le premier, et les écritures vont dans le second", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const first = await openBatch(app, { token: accessToken, projectId, intent: INTENTION });

      const second = await openBatch(app, {
        token: accessToken,
        projectId,
        intent: "Couleurs de la marque",
      });
      const written = await writeTokens(app, { token: accessToken, projectId });

      expect(second.structuredContent.closed).toEqual({ id: first.structuredContent.batch.id });
      expect(written.batch.id).toBe(second.structuredContent.batch.id);
    }));

  it("fermer sans lot ouvert ne ferme rien", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const closed = await closeBatch(app, { token: accessToken, projectId });

      expect(closed.structuredContent).toEqual({ batch: null });
    }));

  it("fermer un lot automatique le ferme aussi", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const automatic = await writeTokens(app, { token: accessToken, projectId });

      const closed = await closeBatch(app, { token: accessToken, projectId });

      expect(closed.structuredContent).toEqual({
        batch: { id: automatic.batch.id, state: "closed", intent: null },
      });
    }));
});

describe("un lot appartient à l'IA d'un membre dans un seul projet (ADR 0013 §1-3)", () => {
  it("le lot continue après une reconnexion de la même IA", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, clientId, refreshToken, projectId } = await seedProject(app, db);
      const opened = await openBatch(app, { token: accessToken, projectId, intent: INTENTION });
      const { access_token: reconnected } = await (
        await refreshTokens(app, { clientId, refreshToken })
      ).json();

      const written = await writeTokens(app, { token: String(reconnected), projectId });

      expect(written.batch.id).toBe(opened.structuredContent.batch.id);
    }));

  it("deux premières écritures simultanées de la même IA vont dans le même lot", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, clientId, userId, projectId } = await seedProject(app, db);
      const heldBatchId = randomUUID();
      const openedAt = new Date();

      const written = await whileHolding(db, {
        hold: (tx) =>
          postgresProposalStore(tx, storageMeterOn(tx)).openBatchOf({
            id: heldBatchId,
            projectId,
            userId,
            clientId,
            intent: null,
            state: "open",
            openedAt,
            lastWrittenAt: openedAt,
          }),
        meanwhile: () => writeTokens(app, { token: accessToken, projectId }),
      });

      expect(written.batch.id).toBe(heldBatchId);
    }));

  it("des écritures dans deux projets produisent deux lots", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, spaceId, projectId } = await seedProject(app, db);
      const otherProjectId = await createProject(app, { accessToken, spaceId });
      await openBatch(app, { token: accessToken, projectId, intent: INTENTION });

      const here = await writeTokens(app, { token: accessToken, projectId });
      const there = await writeTokens(app, { token: accessToken, projectId: otherProjectId });

      expect(there.batch.id).not.toBe(here.batch.id);
      expect(await batchesOf(app, { accessToken, projectId: otherProjectId })).toMatchObject([
        { id: there.batch.id, intent: null, state: "open" },
      ]);
    }));

  it("ouvrir un lot dans un projet ne ferme pas celui d'un autre projet", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, spaceId, projectId } = await seedProject(app, db);
      const otherProjectId = await createProject(app, { accessToken, spaceId });
      const elsewhere = await writeTokens(app, { token: accessToken, projectId: otherProjectId });

      const opened = await openBatch(app, { token: accessToken, projectId, intent: INTENTION });
      await closeBatch(app, { token: accessToken, projectId });

      expect(opened.structuredContent.closed).toBeNull();
      expect(await batchOf(app, { accessToken, batchId: elsewhere.batch.id })).toMatchObject({
        state: "open",
      });
    }));

  it("ouvrir ou fermer un lot ne touche pas au lot d'une autre IA du même membre", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, browser, projectId } = await seedProject(app, db);
      const other = await authorizeAnotherAi(app, { browser, clientName: "Cursor" });
      const others = await writeTokens(app, { token: other.accessToken, projectId });

      const opened = await openBatch(app, { token: accessToken, projectId, intent: INTENTION });
      await closeBatch(app, { token: accessToken, projectId });

      expect(opened.structuredContent.closed).toBeNull();
      expect(await batchOf(app, { accessToken, batchId: others.batch.id })).toMatchObject({
        state: "open",
      });
    }));
});

describe("l'ouverture et la fermeture d'un lot entrent dans l'historique (ADR 0021)", () => {
  it("open_proposal_batch laisse une entrée mcp.open_proposal_batch avec l'intention", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, clientId, projectId } = await seedProject(app, db);

      await openBatch(app, { token: accessToken, projectId, intent: INTENTION });

      expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
        action: "mcp.open_proposal_batch",
        clientId,
        after: { outcome: "success", input: { intent: INTENTION } },
      });
    }));

  it("close_proposal_batch laisse une entrée mcp.close_proposal_batch", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, clientId, projectId } = await seedProject(app, db);
      await openBatch(app, { token: accessToken, projectId, intent: INTENTION });

      await closeBatch(app, { token: accessToken, projectId });

      expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
        action: "mcp.close_proposal_batch",
        clientId,
        after: { outcome: "success" },
      });
    }));
});

describe("ouvrir ou fermer un lot refuse ce qui ne revient pas à l'IA (ADR 0021)", () => {
  const calls: readonly (readonly [string, object])[] = [
    ["open_proposal_batch", { intent: INTENTION }],
    ["close_proposal_batch", {}],
  ];

  it.each(calls)(
    "%s par l'IA d'un non-membre répond « Projet introuvable », sans lot",
    (name, args) =>
      withIdentityApp(async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const grace = await obtainAccessToken(app, { user: GRACE });

        const result = await callTool(app, {
          token: grace.accessToken,
          name,
          args: { projectId, ...args },
        });

        expect(result).toMatchObject({
          isError: true,
          content: [{ type: "text", text: "Projet introuvable" }],
        });
        expect(await batchesOf(app, { accessToken, projectId })).toEqual([]);
      }),
  );

  it.each(calls)("%s sans historique répond « Historique indisponible »", (name, args) =>
    withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);

        const result = await callTool(app, {
          token: accessToken,
          name,
          args: { projectId, ...args },
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
    ),
  );
});

describe("open_proposal_batch exige une intention", () => {
  it.each([
    ["sans intention", undefined],
    ["avec une intention vide", "   "],
  ])("%s, l'appel est refusé, sans lot", (_, intent) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await openBatch(app, { token: accessToken, projectId, intent });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "intent : Intention requise" }],
      });
      expect(await batchesOf(app, { accessToken, projectId })).toEqual([]);
    }),
  );
});

describe("open_proposal_batch et close_proposal_batch s'annoncent à l'IA", () => {
  it("tools/list annonce les deux outils, leur entrée et leur sortie", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await seedProject(app, db);

      const response = await callMcp(app, { token: accessToken, method: "tools/list" });

      expect(await response.json()).toMatchObject({
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "open_proposal_batch",
              description:
                "Ouvre un lot de propositions dans un projet en déclarant l'intention de l'IA, par exemple « Import du Figma Healthcare » ; les écritures suivantes y vont, et le lot ouvert précédent de l'IA dans ce projet se ferme.",
              inputSchema: expect.objectContaining({
                required: ["projectId"],
                properties: expect.objectContaining({ intent: expect.anything() }),
              }),
              outputSchema: expect.objectContaining({
                properties: expect.objectContaining({
                  batch: expect.anything(),
                  closed: expect.anything(),
                }),
              }),
            }),
            expect.objectContaining({
              name: "close_proposal_batch",
              description:
                "Ferme le lot de propositions ouvert de l'IA dans un projet ; l'éditeur peut alors le valider en entier.",
              inputSchema: expect.objectContaining({ required: ["projectId"] }),
              outputSchema: expect.objectContaining({
                properties: expect.objectContaining({ batch: expect.anything() }),
              }),
            }),
          ]),
        },
      });
    }));
});
