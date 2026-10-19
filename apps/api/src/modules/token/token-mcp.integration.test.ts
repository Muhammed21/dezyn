import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  callMcp,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { seedModes, seedProject } from "#testing/project-fixtures.ts";
import {
  addToken,
  historyOf,
  makeColorToken,
  PRIMARY_BLUE,
  seedProposedToken,
} from "#testing/token-fixtures.ts";

const CORRELATION_ID = "lecture-des-tokens-1";

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const SIXTEEN_PX = { value: 16, unit: "px" };

const DESIGN_SYSTEM = [
  makeColorToken({ name: "couleur.bleu.500", $description: "Bleu de marque" }),
  makeColorToken({ name: "couleur.fond.primaire", $value: "{couleur.bleu.500}" }),
  { name: "espacement.moyen", $type: "dimension", $value: SIXTEEN_PX },
  {
    name: "effet.ombre.douce",
    $type: "shadow",
    $value: [
      {
        color: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.25 },
        offsetX: { value: 0, unit: "px" },
        offsetY: { value: 2, unit: "px" },
        blur: { value: 4, unit: "px" },
        spread: { value: 0, unit: "px" },
        inset: true,
      },
    ],
  },
  {
    name: "texte.corps",
    $type: "typography",
    $value: {
      fontFamily: ["Inter", "sans-serif"],
      fontSize: SIXTEEN_PX,
      fontWeight: "bold",
      lineHeight: 1.5,
      letterSpacing: { value: 0.01, unit: "rem" },
    },
  },
];

const byName = (left: { name: string }, right: { name: string }) =>
  left.name.localeCompare(right.name);

const addAll = async (
  app: App,
  { accessToken, projectId, tokens }: { accessToken: string; projectId: string; tokens: object[] },
) => {
  for (const token of tokens) {
    await addToken(app, { accessToken, projectId, token });
  }
};

const readTokens = async (app: App, { token, projectId }: { token: string; projectId: string }) => {
  const response = await callMcp(app, {
    token,
    method: "tools/call",
    params: { name: "read_tokens", arguments: { projectId } },
    correlationId: CORRELATION_ID,
  });
  const { result } = await response.json();
  return result;
};

describe("l'IA lit les tokens validés d'un projet par le MCP (ADR 0012 §6)", () => {
  it("read_tokens rend les tokens ajoutés par un membre, sans perte et triés par nom", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addAll(app, { accessToken, projectId, tokens: DESIGN_SYSTEM });

      const result = await readTokens(app, { token: accessToken, projectId });

      expect(result.structuredContent).toEqual({
        modes: [],
        tokens: DESIGN_SYSTEM.toSorted(byName).map((token) => ({
          id: expect.any(String),
          ...token,
          status: "validated",
        })),
      });
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify(result.structuredContent) },
      ]);
    }));

  it("sur un projet à modes, read_tokens rend une valeur par mode, alias compris", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await seedModes(db, { projectId, modes: ["clair", "sombre"] });
      const tokens = [
        {
          name: "couleur.bleu",
          $type: "color",
          modes: { clair: PRIMARY_BLUE, sombre: NIGHT_BLUE },
        },
        {
          name: "couleur.fond",
          $type: "color",
          modes: { clair: "{couleur.bleu}", sombre: NIGHT_BLUE },
        },
      ];
      await addAll(app, { accessToken, projectId, tokens });

      const result = await readTokens(app, { token: accessToken, projectId });

      expect(result.structuredContent).toEqual({
        modes: ["clair", "sombre"],
        tokens: tokens.map((token) => ({ id: expect.any(String), ...token, status: "validated" })),
      });
    }));

  it("un token qui n'est pas validé n'apparaît pas", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken() });
      await seedProposedToken(db, { projectId, name: "couleur.proposee" });

      const result = await readTokens(app, { token: accessToken, projectId });

      expect(result.structuredContent.tokens.map((token: { name: string }) => token.name)).toEqual([
        "couleur.fond.primaire",
      ]);
    }));

  it("l'appel laisse une entrée mcp.read_tokens avec l'auteur et le client OAuth", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, clientId, userId, spaceId, projectId } = await seedProject(app, db);

      await readTokens(app, { token: accessToken, projectId });

      expect((await historyOf(app, { accessToken, projectId }))[0]).toEqual({
        id: expect.any(String),
        action: "mcp.read_tokens",
        spaceId,
        projectId,
        author: { kind: "member", userId, name: ADA.name },
        clientId,
        before: null,
        after: { outcome: "success", input: {} },
        occurredAt: expect.any(String),
        correlationId: CORRELATION_ID,
      });
    }));

  it("un non-membre reçoit « Projet introuvable », comme pour un projet inexistant", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await seedProject(app, db);
      const grace = await obtainAccessToken(app, { user: GRACE });

      const result = await readTokens(app, { token: grace.accessToken, projectId });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "Projet introuvable" }],
      });
    }));

  it("si l'entrée ne peut pas être écrite, l'outil rend une erreur au lieu des tokens", () =>
    withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);

        const result = await readTokens(app, { token: accessToken, projectId });

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

  it("tools/list annonce read_tokens, son entrée et sa sortie", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await callMcp(app, { token: accessToken, method: "tools/list" });

      expect(await response.json()).toMatchObject({
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "read_tokens",
              description:
                "Lit les tokens validés d'un projet en DTCG, triés par nom : une valeur $value, ou une valeur par mode dans modes, et les alias en {nom.du.token}. Un token porte figma, son dernier état Figma déclaré, et duplicates, les noms des autres tokens validés de même type et de même valeur dans chaque mode. Avec includeProposals, rend aussi les propositions en attente, triées par nom, avec leur statut et leur lot.",
              inputSchema: expect.objectContaining({ required: ["projectId"] }),
              outputSchema: expect.objectContaining({
                properties: expect.objectContaining({
                  modes: expect.anything(),
                  tokens: expect.anything(),
                }),
              }),
            }),
          ]),
        },
      });
    }));
});
