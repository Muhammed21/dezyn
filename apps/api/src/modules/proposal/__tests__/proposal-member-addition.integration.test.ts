import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { addToken, historyOf, makeColorToken, PRIMARY_BLUE } from "#testing/token-fixtures.ts";

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const writeTokens = async (
  app: App,
  { accessToken, projectId, tokens }: { accessToken: string; projectId: string; tokens: object[] },
) => {
  const response = await callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name: "write_tokens", arguments: { projectId, tokens } },
  });
  const { result } = await response.json();
  return result.structuredContent;
};

const request = (
  app: App,
  { accessToken, path, method = "GET" }: { accessToken: string; path: string; method?: string },
) =>
  app.request(`${BASE_URL}/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}` },
  });

const batchOf = async (
  app: App,
  { accessToken, batchId }: { accessToken: string; batchId: string },
) => (await request(app, { accessToken, path: `/proposal-batches/${batchId}` })).json();

describe("l'ajout d'un membre remplace la proposition en attente sur le même nom (ADR 0026 §4)", () => {
  it("l'ajout réussit, la proposition passe à Remplacée dans son lot, et la réponse la désigne", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { batch, proposals } = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });

      const response = await addToken(app, { accessToken, projectId, token: makeColorToken() });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        id: expect.any(String),
        name: "couleur.fond.primaire",
        $type: "color",
        $value: PRIMARY_BLUE,
        status: "validated",
        replaced: { id: proposals[0].id, batchId: batch.id },
      });
      expect((await batchOf(app, { accessToken, batchId: batch.id })).proposals).toMatchObject([
        { id: proposals[0].id, status: "replaced" },
      ]);
    }));

  it("l'entrée token.created désigne la proposition remplacée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { batch, proposals } = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });

      await addToken(app, { accessToken, projectId, token: makeColorToken() });

      expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
        action: "token.created",
        after: {
          name: "couleur.fond.primaire",
          replaced: { id: proposals[0].id, batchId: batch.id },
        },
      });
    }));

  it("sans proposition en attente sur ce nom, la réponse ne désigne rien", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.bleu.500" })],
      });

      const response = await addToken(app, { accessToken, projectId, token: makeColorToken() });

      expect(await response.json()).toMatchObject({ replaced: null });
    }));

  it("une proposition déjà rejetée n'est pas remplacée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { batch, proposals } = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });
      await request(app, {
        accessToken,
        path: `/proposals/${proposals[0].id}/reject`,
        method: "POST",
      });

      const response = await addToken(app, { accessToken, projectId, token: makeColorToken() });

      expect(await response.json()).toMatchObject({ replaced: null });
      expect((await batchOf(app, { accessToken, batchId: batch.id })).proposals).toMatchObject([
        { status: "rejected" },
      ]);
    }));

  it("si l'entrée token.created ne peut pas être écrite, la proposition reste Proposée", () =>
    withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const { batch } = await writeTokens(app, {
          accessToken,
          projectId,
          tokens: [makeColorToken({ $value: NIGHT_BLUE })],
        });

        const response = await addToken(app, { accessToken, projectId, token: makeColorToken() });

        expect(response.status).toBe(500);
        expect((await batchOf(app, { accessToken, batchId: batch.id })).proposals).toMatchObject([
          { status: "proposed" },
        ]);
      },
      {
        wrapHistoryWriter: (writer) => ({
          append: (entry) =>
            entry.action === "token.created"
              ? Promise.reject(new Error("historique indisponible"))
              : writer.append(entry),
        }),
      },
    ));
});
