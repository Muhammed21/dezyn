import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { addToken, makeColorToken } from "#testing/token-fixtures.ts";

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const SKY_BLUE = { colorSpace: "srgb", components: [0.4, 0.7, 0.9] };

const COMPARED_AT = "2026-10-19T09:00:00.000Z";

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

const declareFigmaStates = async (
  app: App,
  { token, projectId, states }: { token: string; projectId: string; states: unknown },
) =>
  (await callTool(app, { token, name: "declare_figma_states", args: { projectId, states } }))
    .structuredContent;

const request = (
  app: App,
  { accessToken, path, body }: { accessToken: string; path: string; body?: object },
) =>
  app.request(`${BASE_URL}/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const tokensOf = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) =>
  (await (await request(app, { accessToken, path: `/projects/${projectId}/tokens` })).json())
    .tokens;

const seedDivergence = async (
  app: App,
  db: Parameters<typeof seedProject>[1],
  clock: { instant: Date },
) => {
  const seeded = await seedProject(app, db);
  await addToken(app, { ...seeded, token: makeColorToken({ name: "couleur.fond" }) });
  await addToken(app, { ...seeded, token: makeColorToken({ name: "couleur.bord" }) });
  const declared = await declareFigmaStates(app, {
    token: seeded.accessToken,
    projectId: seeded.projectId,
    states: [
      { name: "couleur.fond", state: "diverged", figmaValue: { $value: NIGHT_BLUE } },
      { name: "couleur.bord", state: "diverged", figmaValue: { $value: SKY_BLUE } },
    ],
  });
  clock.instant = new Date("2026-10-19T11:00:00.000Z");
  const [fond, bord] = declared.states;
  return { ...seeded, fond: fond.proposal, bord: bord.proposal };
};

const withClock = (
  test: (
    app: App,
    db: Parameters<typeof seedProject>[1],
    clock: { instant: Date },
  ) => Promise<void>,
) => {
  const clock = { instant: new Date(COMPARED_AT) };
  return withIdentityApp((app, db) => test(app, db, clock), { clock: () => clock.instant });
};

describe("valider la valeur Figma passe le token à synchronisé, à la date de la comparaison (ADR 0024 §4)", () => {
  it("la validation d'une proposition adopte la valeur Figma et synchronise le token", () =>
    withClock(async (app, db, clock) => {
      const { accessToken, projectId, fond } = await seedDivergence(app, db, clock);

      const validated = await request(app, {
        accessToken,
        path: `/proposals/${fond.id}/validate`,
        body: {},
      });
      const tokens = await tokensOf(app, { accessToken, projectId });

      expect(validated.status).toBe(200);
      expect(tokens).toMatchObject([
        { name: "couleur.bord", figma: { state: "diverged" } },
        {
          name: "couleur.fond",
          $value: NIGHT_BLUE,
          figma: { state: "synced", declaredAt: COMPARED_AT },
        },
      ]);
    }));

  it("la validation d'un lot fermé synchronise ses tokens validés, et un token rejeté reste divergent", () =>
    withClock(async (app, db, clock) => {
      const { accessToken, projectId, fond, bord } = await seedDivergence(app, db, clock);
      await callTool(app, {
        token: accessToken,
        name: "close_proposal_batch",
        args: { projectId },
      });

      const validated = await request(app, {
        accessToken,
        path: `/proposal-batches/${fond.batch.id}/validate`,
        body: { rejected: [bord.id] },
      });
      const tokens = await tokensOf(app, { accessToken, projectId });

      expect(validated.status).toBe(200);
      expect(tokens).toMatchObject([
        { name: "couleur.bord", figma: { state: "diverged" } },
        { name: "couleur.fond", figma: { state: "synced", declaredAt: COMPARED_AT } },
      ]);
    }));
});

describe("seule la proposition née de la dernière comparaison synchronise le token", () => {
  it("après une nouvelle déclaration, valider l'ancienne proposition ne change plus l'état", () =>
    withClock(async (app, db, clock) => {
      const { accessToken, projectId, fond } = await seedDivergence(app, db, clock);
      await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [{ name: "couleur.fond", state: "missing_in_figma" }],
      });

      await request(app, { accessToken, path: `/proposals/${fond.id}/validate`, body: {} });
      const tokens = await tokensOf(app, { accessToken, projectId });

      expect(tokens[1]).toMatchObject({
        name: "couleur.fond",
        $value: NIGHT_BLUE,
        figma: { state: "missing_in_figma", declaredAt: "2026-10-19T11:00:00.000Z" },
      });
    }));

  it("une comparaison qui relit la même valeur Figma garde la proposition en attente", () =>
    withClock(async (app, db, clock) => {
      const { accessToken, projectId, fond } = await seedDivergence(app, db, clock);
      await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [{ name: "couleur.fond", state: "diverged", figmaValue: { $value: NIGHT_BLUE } }],
      });

      await request(app, { accessToken, path: `/proposals/${fond.id}/validate`, body: {} });
      const tokens = await tokensOf(app, { accessToken, projectId });

      expect(tokens[1]).toMatchObject({
        name: "couleur.fond",
        figma: { state: "synced", declaredAt: "2026-10-19T11:00:00.000Z" },
      });
    }));

  it("valider une proposition de write_tokens ne touche pas l'état Figma", () =>
    withClock(async (app, db) => {
      const seeded = await seedProject(app, db);
      const { accessToken, projectId } = seeded;
      await addToken(app, { ...seeded, token: makeColorToken({ name: "couleur.fond" }) });
      await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [{ name: "couleur.fond", state: "missing_in_figma" }],
      });
      const written = await callTool(app, {
        token: accessToken,
        name: "write_tokens",
        args: { projectId, tokens: [makeColorToken({ name: "couleur.fond", $value: NIGHT_BLUE })] },
      });

      await request(app, {
        accessToken,
        path: `/proposals/${written.structuredContent.proposals[0].id}/validate`,
        body: {},
      });
      const tokens = await tokensOf(app, { accessToken, projectId });

      expect(tokens[0]).toMatchObject({ $value: NIGHT_BLUE, figma: { state: "missing_in_figma" } });
    }));
});
