import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "../../testing/authorization-flow.ts";
import { seedProject } from "../../testing/project-fixtures.ts";
import { addToken, historyOf, makeColorToken, PRIMARY_BLUE } from "../../testing/token-fixtures.ts";

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const SKY_BLUE = { colorSpace: "srgb", components: [0.4, 0.7, 0.9] };

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

const readTokens = (app: App, { token, args }: { token: string; args: object }) =>
  callTool(app, { token, name: "read_tokens", args });

const writeTokens = async (
  app: App,
  { token, projectId, tokens }: { token: string; projectId: string; tokens: readonly object[] },
) =>
  (await callTool(app, { token, name: "write_tokens", args: { projectId, tokens } }))
    .structuredContent;

const seedPendingWork = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) => {
  await addToken(app, { accessToken, projectId, token: makeColorToken() });
  return writeTokens(app, {
    token: accessToken,
    projectId,
    tokens: [
      makeColorToken({ $value: NIGHT_BLUE }),
      makeColorToken({ name: "couleur.bleu.500", $value: SKY_BLUE }),
    ],
  });
};

describe("sans le demander, l'IA ne lit que les données validées (ADR 0012 §6)", () => {
  it.each([
    ["sans le paramètre", {}],
    ["avec includePropositions à false", { includePropositions: false }],
  ])("%s, la lecture rend les tokens validés seuls", (_, option) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await seedPendingWork(app, { accessToken, projectId });

      const result = await readTokens(app, { token: accessToken, args: { projectId, ...option } });

      expect(result.structuredContent).toEqual({
        modes: [],
        tokens: [
          {
            id: expect.any(String),
            name: "couleur.fond.primaire",
            $type: "color",
            $value: PRIMARY_BLUE,
            status: "validated",
          },
        ],
      });
    }),
  );
});

describe("sur demande, l'IA lit aussi les propositions en attente, avec leur statut et leur lot (ADR 0012 §6)", () => {
  it("chaque proposition en attente vient avec sa nature, son statut, son lot et sa valeur", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { lot, propositions } = await seedPendingWork(app, { accessToken, projectId });

      const result = await readTokens(app, {
        token: accessToken,
        args: { projectId, includePropositions: true },
      });

      expect(result.structuredContent).toEqual({
        modes: [],
        tokens: [expect.objectContaining({ name: "couleur.fond.primaire", $value: PRIMARY_BLUE })],
        propositions: [
          {
            id: propositions[1].id,
            name: "couleur.bleu.500",
            kind: "create",
            status: "proposed",
            lot: { id: lot.id, state: "open" },
            token: { name: "couleur.bleu.500", $type: "color", $value: SKY_BLUE },
          },
          {
            id: propositions[0].id,
            name: "couleur.fond.primaire",
            kind: "update",
            status: "proposed",
            lot: { id: lot.id, state: "open" },
            token: { name: "couleur.fond.primaire", $type: "color", $value: NIGHT_BLUE },
          },
        ],
      });
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify(result.structuredContent) },
      ]);
    }));

  it("les propositions relues ou remplacées n'apparaissent plus", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const first = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [makeColorToken(), makeColorToken({ name: "couleur.bleu.500" })],
      });
      const second = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });
      await app.request(`${BASE_URL}/v1/proposals/${first.propositions[1].id}/reject`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      const result = await readTokens(app, {
        token: accessToken,
        args: { projectId, includePropositions: true },
      });

      expect(result.structuredContent.propositions).toEqual([
        expect.objectContaining({ id: second.propositions[0].id, status: "proposed" }),
      ]);
    }));

  it("un lot fermé par expiration se lit fermé", () => {
    const clock = { instant: new Date("2026-10-19T09:00:00Z") };
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const { lot } = await writeTokens(app, {
          token: accessToken,
          projectId,
          tokens: [makeColorToken()],
        });
        clock.instant = new Date("2026-10-19T09:30:00Z");

        const result = await readTokens(app, {
          token: accessToken,
          args: { projectId, includePropositions: true },
        });

        expect(result.structuredContent.propositions).toMatchObject([
          { lot: { id: lot.id, state: "closed" } },
        ]);
      },
      { clock: () => clock.instant },
    );
  });

  it("les propositions d'un autre projet n'apparaissent pas", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, spaceId, projectId } = await seedProject(app, db);
      const created = await app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ name: "Application mobile" }),
      });
      const { id: otherProjectId } = await created.json();
      await writeTokens(app, {
        token: accessToken,
        projectId: String(otherProjectId),
        tokens: [makeColorToken()],
      });

      const result = await readTokens(app, {
        token: accessToken,
        args: { projectId, includePropositions: true },
      });

      expect(result.structuredContent.propositions).toEqual([]);
    }));
});

describe("le paramètre de lecture des propositions est strict et entre dans l'historique (ADR 0021)", () => {
  it("un includePropositions qui n'est pas un booléen est refusé", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await readTokens(app, {
        token: accessToken,
        args: { projectId, includePropositions: "oui" },
      });

      expect(result).toMatchObject({ isError: true });
      expect(result.structuredContent).toBeUndefined();
    }));

  it("l'entrée mcp.read_tokens garde le paramètre demandé", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      await readTokens(app, {
        token: accessToken,
        args: { projectId, includePropositions: true },
      });

      expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
        action: "mcp.read_tokens",
        after: { outcome: "success", input: { includePropositions: true } },
      });
    }));

  it("tools/list annonce le paramètre et les propositions de la sortie", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await seedProject(app, db);

      const response = await callMcp(app, { token: accessToken, method: "tools/list" });

      expect(await response.json()).toMatchObject({
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "read_tokens",
              description:
                "Lit les tokens validés d'un projet en DTCG, triés par nom : une valeur $value, ou une valeur par mode dans modes, et les alias en {nom.du.token}. Avec includePropositions, rend aussi les propositions en attente, triées par nom, avec leur statut et leur lot.",
              inputSchema: expect.objectContaining({
                properties: expect.objectContaining({
                  includePropositions: expect.objectContaining({ type: "boolean" }),
                }),
              }),
              outputSchema: expect.objectContaining({
                properties: expect.objectContaining({ propositions: expect.anything() }),
              }),
            }),
          ]),
        },
      });
    }));
});
