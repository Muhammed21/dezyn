import { describe, expect, it } from "vitest";

import { schema } from "@repo/db";

import {
  type App,
  authorizeAnotherAi,
  BASE_URL,
  callMcp,
  withIdentityApp,
} from "../../testing/authorization-flow.ts";
import { seedProject } from "../../testing/project-fixtures.ts";
import { addToken, makeColorToken, PRIMARY_BLUE } from "../../testing/token-fixtures.ts";

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const SKY_BLUE = { colorSpace: "srgb", components: [0.4, 0.7, 0.9] };

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

describe("une nouvelle écriture remplace la proposition en attente sur le même token (ADR 0013 §6)", () => {
  it("la proposition d'une autre IA, dans un autre lot, passe à Remplacée, et la nouvelle est Proposée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, browser, projectId } = await seedProject(app, db);
      const other = await authorizeAnotherAi(app, { browser, clientName: "Cursor" });
      const first = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });

      const second = await writeTokens(app, {
        accessToken: other.accessToken,
        projectId,
        tokens: [makeColorToken({ $value: SKY_BLUE })],
      });

      expect(second).toEqual({
        batch: { id: expect.any(String), state: "open" },
        proposals: [
          {
            id: expect.any(String),
            name: "couleur.fond.primaire",
            kind: "create",
            status: "proposed",
          },
        ],
        unchanged: [],
        replaced: [
          { id: first.proposals[0].id, name: "couleur.fond.primaire", batchId: first.batch.id },
        ],
      });
      expect(second.batch.id).not.toBe(first.batch.id);
      expect(
        (await batchOf(app, { accessToken, batchId: first.batch.id })).proposals,
      ).toMatchObject([{ id: first.proposals[0].id, status: "replaced" }]);
    }));

  it("une proposition déjà relue n'est pas remplacée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const first = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.bleu.500" })],
      });
      await request(app, {
        accessToken,
        path: `/proposals/${first.proposals[0].id}/reject`,
        method: "POST",
      });

      const second = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.bleu.500", $value: SKY_BLUE })],
      });

      expect(second.replaced).toEqual([]);
      expect(
        (await batchOf(app, { accessToken, batchId: first.batch.id })).proposals,
      ).toMatchObject([{ status: "rejected" }, { status: "proposed" }]);
    }));

  it("chaque token réécrit remplace sa propre proposition en attente", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const first = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [
          makeColorToken({ name: "couleur.bleu.500" }),
          makeColorToken({ name: "couleur.bleu.700" }),
        ],
      });

      const second = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [
          makeColorToken({ name: "couleur.bleu.500", $value: NIGHT_BLUE }),
          makeColorToken({ name: "couleur.bleu.700", $value: SKY_BLUE }),
        ],
      });

      expect(second.replaced).toEqual([
        { id: first.proposals[0].id, name: "couleur.bleu.500", batchId: first.batch.id },
        { id: first.proposals[1].id, name: "couleur.bleu.700", batchId: first.batch.id },
      ]);
    }));

  it("une proposition sur un autre token n'est pas remplacée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.bleu.500" })],
      });

      const second = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.bleu.700" })],
      });

      expect(second.replaced).toEqual([]);
    }));

  it("réécrire la valeur déjà en attente ne change rien", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const first = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });

      const second = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });

      expect(second).toEqual({
        batch: first.batch,
        proposals: [],
        unchanged: ["couleur.fond.primaire"],
        replaced: [],
      });
    }));

  it("une proposition Remplacée ne se relit plus, et le lot ne la compte plus à relire", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const first = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });
      await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $value: SKY_BLUE })],
      });

      const response = await request(app, {
        accessToken,
        path: `/proposals/${first.proposals[0].id}/validate`,
        method: "POST",
      });
      const { batches } = await (
        await request(app, { accessToken, path: `/projects/${projectId}/proposal-batches` })
      ).json();

      expect(response.status).toBe(409);
      expect(batches).toMatchObject([{ id: first.batch.id, toReview: 1 }]);
    }));
});

describe("revenir à la valeur validée remplace la proposition en attente, sans en créer (ADR 0013 §8)", () => {
  it("la modification en attente passe à Remplacée, rien n'est proposé, et aucun lot ne s'ouvre", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, browser, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken() });
      const first = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });
      const other = await authorizeAnotherAi(app, { browser, clientName: "Cursor" });

      const back = await writeTokens(app, {
        accessToken: other.accessToken,
        projectId,
        tokens: [makeColorToken({ $value: PRIMARY_BLUE })],
      });

      expect(back).toEqual({
        batch: null,
        proposals: [],
        unchanged: ["couleur.fond.primaire"],
        replaced: [
          { id: first.proposals[0].id, name: "couleur.fond.primaire", batchId: first.batch.id },
        ],
      });
      expect(await db.orm.select().from(schema.proposalBatch)).toHaveLength(1);
      expect(
        (await batchOf(app, { accessToken, batchId: first.batch.id })).proposals,
      ).toMatchObject([{ status: "replaced" }]);
    }));
});
