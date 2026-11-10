import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { addToken, makeColorToken } from "#testing/token-fixtures.ts";

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

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

const seedDuplicates = async (app: App, db: Parameters<typeof seedProject>[1]) => {
  const seeded = await seedProject(app, db);
  await addToken(app, { ...seeded, token: makeColorToken({ name: "couleur.fond" }) });
  await addToken(app, { ...seeded, token: makeColorToken({ name: "couleur.bord" }) });
  await addToken(app, {
    ...seeded,
    token: makeColorToken({ name: "couleur.texte", $value: NIGHT_BLUE }),
  });
  return seeded;
};

describe("la lecture signale les doublons de dezyn parmi les tokens validés (ADR 0024 §5)", () => {
  it("les tokens de même type et de même valeur se citent l'un l'autre", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedDuplicates(app, db);

      const tokens = await tokensOf(app, { accessToken, projectId });

      expect(tokens).toMatchObject([
        { name: "couleur.bord", duplicates: ["couleur.fond"] },
        { name: "couleur.fond", duplicates: ["couleur.bord"] },
        { name: "couleur.texte" },
      ]);
      expect(tokens[2]).not.toHaveProperty("duplicates");
    }));

  it("l'IA lit les mêmes doublons par read_tokens", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedDuplicates(app, db);

      const read = await callTool(app, {
        token: accessToken,
        name: "read_tokens",
        args: { projectId },
      });

      expect(read.isError).toBeUndefined();
      expect(read.structuredContent.tokens).toMatchObject([
        { name: "couleur.bord", duplicates: ["couleur.fond"] },
        { name: "couleur.fond", duplicates: ["couleur.bord"] },
        { name: "couleur.texte" },
      ]);
    }));

  it("une proposition en attente de même valeur ne crée pas de doublon", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      const { accessToken, projectId } = seeded;
      await addToken(app, { ...seeded, token: makeColorToken({ name: "couleur.fond" }) });
      await callTool(app, {
        token: accessToken,
        name: "write_tokens",
        args: { projectId, tokens: [makeColorToken({ name: "couleur.bord" })] },
      });

      const tokens = await tokensOf(app, { accessToken, projectId });

      expect(tokens).toHaveLength(1);
      expect(tokens[0]).not.toHaveProperty("duplicates");
    }));

  it("un doublon disparaît dès que l'un des deux tokens change de valeur validée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedDuplicates(app, db);
      const written = await callTool(app, {
        token: accessToken,
        name: "write_tokens",
        args: { projectId, tokens: [makeColorToken({ name: "couleur.bord", $value: NIGHT_BLUE })] },
      });
      await request(app, {
        accessToken,
        path: `/proposals/${written.structuredContent.proposals[0].id}/validate`,
        body: {},
      });

      const tokens = await tokensOf(app, { accessToken, projectId });

      expect(tokens).toMatchObject([
        { name: "couleur.bord", duplicates: ["couleur.texte"] },
        { name: "couleur.fond" },
        { name: "couleur.texte", duplicates: ["couleur.bord"] },
      ]);
      expect(tokens[1]).not.toHaveProperty("duplicates");
    }));

  it("un doublon dans Figma se lit dans figma, distinct du doublon de dezyn", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedDuplicates(app, db);
      await callTool(app, {
        token: accessToken,
        name: "declare_figma_states",
        args: {
          projectId,
          states: [
            {
              name: "couleur.texte",
              state: "duplicate_in_figma",
              figmaVariables: ["texte/principal", "texte/defaut"],
            },
          ],
        },
      });

      const tokens = await tokensOf(app, { accessToken, projectId });

      expect(tokens[2]).toMatchObject({
        name: "couleur.texte",
        figma: { state: "duplicate_in_figma" },
      });
      expect(tokens[2]).not.toHaveProperty("duplicates");
    }));
});
