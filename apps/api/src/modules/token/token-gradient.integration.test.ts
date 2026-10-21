import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { addToken } from "#testing/token-fixtures.ts";

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

const tokensOf = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) => {
  const response = await app.request(`${BASE_URL}/v1/projects/${projectId}/tokens`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return (await response.json()).tokens;
};

const BLUE = { colorSpace: "srgb", components: [0, 0.4, 1] };

const VIOLET = { colorSpace: "srgb", components: [0.5, 0, 1] };

const HERO_GRADIENT = {
  name: "degrade.hero",
  $type: "gradient",
  $value: [
    { color: BLUE, position: 0 },
    { color: VIOLET, position: 1 },
  ],
};

describe("un membre ajoute un dégradé (ADR 0028 §1)", () => {
  it("un dégradé en dur se relit à l'identique", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);

      const response = await addToken(app, { ...seeded, token: HERO_GRADIENT });

      expect(response.status).toBe(201);
      expect(await tokensOf(app, seeded)).toEqual([
        { id: expect.any(String), ...HERO_GRADIENT, status: "validated" },
      ]);
    }));

  it("un dégradé qui se réfère à un dégradé validé se relit avec sa référence", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: HERO_GRADIENT });
      const alias = { name: "degrade.bouton", $type: "gradient", $value: "{degrade.hero}" };

      const response = await addToken(app, { ...seeded, token: alias });

      expect(response.status).toBe(201);
      expect(await tokensOf(app, seeded)).toContainEqual(
        expect.objectContaining({ ...alias, status: "validated" }),
      );
    }));

  it.each([
    ["sans arrêt", [], "$value", "Dégradé sans arrêt"],
    [
      "dont un arrêt n'a pas de couleur",
      [{ color: BLUE, position: 0 }, { position: 1 }],
      "$value.1.color",
      undefined,
    ],
    [
      "dont un arrêt est placé au-delà de 1",
      [
        { color: BLUE, position: 0 },
        { color: VIOLET, position: 1.5 },
      ],
      "$value.1.position",
      "Position hors de l'intervalle 0 à 1",
    ],
    [
      "dont un arrêt est placé avant 0",
      [{ color: BLUE, position: -0.2 }],
      "$value.0.position",
      "Position hors de l'intervalle 0 à 1",
    ],
    [
      "dont la couleur d'un arrêt sort de l'intervalle",
      [{ color: { ...BLUE, components: [0, 0.4, 1.2] }, position: 0 }],
      "$value.0.color.components",
      "Composante hors de l'intervalle 0 à 1",
    ],
  ])("un dégradé %s répond 400 en désignant l'arrêt", (_case, $value, path, message) =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);

      const response = await addToken(app, { ...seeded, token: { ...HERO_GRADIENT, $value } });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        errors: [message === undefined ? { path } : { path, message }],
      });
    }),
  );
});

describe("l'IA propose un dégradé (ADR 0028 §1)", () => {
  it("une fois validé, read_tokens le rend à l'identique", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const written = await callTool(app, {
        token: accessToken,
        name: "write_tokens",
        args: { projectId, tokens: [HERO_GRADIENT] },
      });
      await app.request(
        `${BASE_URL}/v1/proposals/${written.structuredContent.proposals[0].id}/validate`,
        { method: "POST", headers: { authorization: `Bearer ${accessToken}` } },
      );

      const read = await callTool(app, {
        token: accessToken,
        name: "read_tokens",
        args: { projectId },
      });

      expect(read.structuredContent.tokens).toEqual([
        { id: expect.any(String), ...HERO_GRADIENT, status: "validated" },
      ]);
    }));
});

describe("deux dégradés de mêmes arrêts sont des doublons (ADR 0024 §5)", () => {
  it("la copie cite le dégradé d'origine", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: HERO_GRADIENT });
      await addToken(app, { ...seeded, token: { ...HERO_GRADIENT, name: "degrade.copie" } });

      expect(await tokensOf(app, seeded)).toContainEqual(
        expect.objectContaining({ name: "degrade.copie", duplicates: [HERO_GRADIENT.name] }),
      );
    }));
});

describe("la valeur Figma divergente d'un dégradé devient une proposition (ADR 0024 §4)", () => {
  it("avec la valeur Figma comme valeur proposée", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: HERO_GRADIENT });
      const figmaValue = {
        $value: [
          { color: BLUE, position: 0 },
          { color: VIOLET, position: 0.8 },
        ],
      };

      const declared = await callTool(app, {
        token: seeded.accessToken,
        name: "declare_figma_states",
        args: {
          projectId: seeded.projectId,
          states: [{ name: HERO_GRADIENT.name, state: "diverged", figmaValue }],
        },
      });

      expect(declared.isError).toBeUndefined();
      expect(declared.structuredContent.states).toMatchObject([
        { name: HERO_GRADIENT.name, state: "diverged", proposal: { id: expect.any(String) } },
      ]);
    }));
});
