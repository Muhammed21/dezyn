import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "../../testing/authorization-flow.ts";
import { seedProject } from "../../testing/project-fixtures.ts";
import { addToken, makeColorToken } from "../../testing/token-fixtures.ts";

const START = new Date("2026-10-19T09:00:00Z");

const MINUTE = 60 * 1000;

const makeClock = () => {
  let instant = START;
  return {
    now: () => instant,
    at: (elapsed: number) => {
      instant = new Date(START.getTime() + elapsed);
    },
  };
};

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
  return result.structuredContent;
};

const writeTokens = (
  app: App,
  {
    token,
    projectId,
    name = "couleur.fond.primaire",
  }: { token: string; projectId: string; name?: string },
) =>
  callTool(app, {
    token,
    name: "write_tokens",
    args: { projectId, tokens: [makeColorToken({ name })] },
  });

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

describe("une écriture constate qu'un lot s'est fermé après 30 minutes sans écriture (ADR 0013 §7)", () => {
  it("à 30 minutes moins un instant, l'écriture va encore dans le lot", () => {
    const clock = makeClock();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const first = await writeTokens(app, { token: accessToken, projectId });
        clock.at(30 * MINUTE - 1);

        const second = await writeTokens(app, {
          token: accessToken,
          projectId,
          name: "couleur.bleu.500",
        });

        expect(second.batch.id).toBe(first.batch.id);
      },
      { clock: clock.now },
    );
  });

  it("à 30 minutes, l'écriture ouvre un nouveau lot automatique, et l'ancien est fermé", () => {
    const clock = makeClock();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const first = await writeTokens(app, { token: accessToken, projectId });
        clock.at(30 * MINUTE);

        const second = await writeTokens(app, {
          token: accessToken,
          projectId,
          name: "couleur.bleu.500",
        });

        expect(second.batch).toEqual({ id: expect.any(String), state: "open" });
        expect(second.batch.id).not.toBe(first.batch.id);
        expect(await batchesOf(app, { accessToken, projectId })).toMatchObject([
          { id: second.batch.id, state: "open", intent: null },
          { id: first.batch.id, state: "closed" },
        ]);
      },
      { clock: clock.now },
    );
  });

  it("une proposition rangée dans le lot repousse sa fermeture de 30 minutes", () => {
    const clock = makeClock();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const first = await writeTokens(app, { token: accessToken, projectId });
        clock.at(20 * MINUTE);
        await writeTokens(app, { token: accessToken, projectId, name: "couleur.bleu.500" });
        clock.at(49 * MINUTE);

        const third = await writeTokens(app, {
          token: accessToken,
          projectId,
          name: "couleur.bleu.700",
        });

        expect(third.batch.id).toBe(first.batch.id);
      },
      { clock: clock.now },
    );
  });

  it("une écriture identique à la valeur validée ne repousse pas la fermeture", () => {
    const clock = makeClock();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        await addToken(app, { accessToken, projectId, token: makeColorToken() });
        const first = await writeTokens(app, {
          token: accessToken,
          projectId,
          name: "couleur.bleu.500",
        });
        clock.at(20 * MINUTE);
        await writeTokens(app, { token: accessToken, projectId });
        clock.at(30 * MINUTE);

        const unchanged = await writeTokens(app, { token: accessToken, projectId });

        expect(unchanged).toMatchObject({ batch: null, unchanged: ["couleur.fond.primaire"] });
        expect(await batchOf(app, { accessToken, batchId: first.batch.id })).toMatchObject({
          state: "closed",
        });
      },
      { clock: clock.now },
    );
  });
});

describe("une lecture constate qu'un lot s'est fermé après 30 minutes sans écriture (ADR 0013 §7)", () => {
  it("à 30 minutes moins un instant, le lot se lit ouvert ; à 30 minutes, fermé", () => {
    const clock = makeClock();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const { batch } = await writeTokens(app, { token: accessToken, projectId });
        clock.at(30 * MINUTE - 1);
        const before = await batchOf(app, { accessToken, batchId: batch.id });
        clock.at(30 * MINUTE);

        const after = await batchOf(app, { accessToken, batchId: batch.id });

        expect(before).toMatchObject({ state: "open" });
        expect(after).toMatchObject({ state: "closed" });
        expect(await batchesOf(app, { accessToken, projectId })).toMatchObject([
          { id: batch.id, state: "closed" },
        ]);
      },
      { clock: clock.now },
    );
  });
});

describe("ouvrir ou fermer un lot constate son expiration (ADR 0013 §7)", () => {
  it("ouvrir un lot après expiration du lot ouvert ne ferme rien de plus", () => {
    const clock = makeClock();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const expired = await writeTokens(app, { token: accessToken, projectId });
        clock.at(30 * MINUTE);

        const opened = await callTool(app, {
          token: accessToken,
          name: "open_proposal_batch",
          args: { projectId, intent: "Import du Figma Healthcare" },
        });

        expect(opened.closed).toBeNull();
        expect(await batchOf(app, { accessToken, batchId: expired.batch.id })).toMatchObject({
          state: "closed",
        });
      },
      { clock: clock.now },
    );
  });

  it("fermer un lot expiré ne ferme rien", () => {
    const clock = makeClock();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        await writeTokens(app, { token: accessToken, projectId });
        clock.at(30 * MINUTE);

        const closed = await callTool(app, {
          token: accessToken,
          name: "close_proposal_batch",
          args: { projectId },
        });

        expect(closed).toEqual({ batch: null });
      },
      { clock: clock.now },
    );
  });

  it("un lot déclaré expire aussi, et l'écriture suivante va dans un lot automatique", () => {
    const clock = makeClock();
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const opened = await callTool(app, {
          token: accessToken,
          name: "open_proposal_batch",
          args: { projectId, intent: "Import du Figma Healthcare" },
        });
        clock.at(30 * MINUTE);

        const written = await writeTokens(app, { token: accessToken, projectId });

        expect(written.batch.id).not.toBe(opened.batch.id);
        expect(await batchOf(app, { accessToken, batchId: written.batch.id })).toMatchObject({
          intent: null,
        });
      },
      { clock: clock.now },
    );
  });
});
