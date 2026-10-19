import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedModes, seedProject } from "#testing/project-fixtures.ts";
import { addToken, makeColorToken, PRIMARY_BLUE } from "#testing/token-fixtures.ts";
import { schema } from "@repo/db";

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const INTENT = "Comparaison avec le Figma Healthcare";

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

const declareFigmaStates = (
  app: App,
  { token, projectId, states }: { token: string; projectId: string; states: unknown },
) => callTool(app, { token, name: "declare_figma_states", args: { projectId, states } });

const getJson = async (app: App, { accessToken, path }: { accessToken: string; path: string }) =>
  (
    await app.request(`${BASE_URL}/v1${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
  ).json();

const seedComparedToken = async (app: App, db: Parameters<typeof seedProject>[1]) => {
  const seeded = await seedProject(app, db);
  await addToken(app, {
    ...seeded,
    token: makeColorToken({ name: "couleur.fond", $description: "Fond des pages" }),
  });
  return seeded;
};

describe("la valeur Figma d'un token divergent devient une proposition (ADR 0024 §4)", () => {
  it("dans le lot ouvert de l'IA, et la valeur validée continue de faire foi", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedToken(app, db);
      const opened = await callTool(app, {
        token: accessToken,
        name: "open_proposal_batch",
        args: { projectId, intent: INTENT },
      });

      const declared = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [{ name: "couleur.fond", state: "diverged", figmaValue: { $value: NIGHT_BLUE } }],
      });
      const { batch } = opened.structuredContent;
      const reviewed = await getJson(app, { accessToken, path: `/proposal-batches/${batch.id}` });
      const read = await getJson(app, { accessToken, path: `/projects/${projectId}/tokens` });

      expect(declared.structuredContent.states).toEqual([
        {
          name: "couleur.fond",
          state: "diverged",
          declaredAt: expect.any(String),
          proposal: { id: expect.any(String), batch: { id: batch.id, state: "open" } },
        },
      ]);
      expect(reviewed.proposals).toMatchObject([
        {
          id: declared.structuredContent.states[0].proposal.id,
          name: "couleur.fond",
          kind: "update",
          status: "proposed",
          validated: expect.objectContaining({ $value: PRIMARY_BLUE }),
          proposed: expect.objectContaining({
            $type: "color",
            $value: NIGHT_BLUE,
            $description: "Fond des pages",
          }),
        },
      ]);
      expect(read.tokens).toMatchObject([
        { name: "couleur.fond", $value: PRIMARY_BLUE, figma: { state: "diverged" } },
      ]);
    }));

  it("sans lot ouvert, dans un lot automatique", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedToken(app, db);

      const declared = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [{ name: "couleur.fond", state: "diverged", figmaValue: { $value: NIGHT_BLUE } }],
      });
      const batches = await getJson(app, {
        accessToken,
        path: `/projects/${projectId}/proposal-batches`,
      });

      expect(batches.batches).toMatchObject([
        {
          id: declared.structuredContent.states[0].proposal.batch.id,
          intent: null,
          toReview: 1,
        },
      ]);
    }));

  it("une valeur Figma déjà en attente ne crée pas de seconde proposition", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedToken(app, db);
      const divergence = [
        { name: "couleur.fond", state: "diverged", figmaValue: { $value: NIGHT_BLUE } },
      ];
      await declareFigmaStates(app, { token: accessToken, projectId, states: divergence });

      const again = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: divergence,
      });

      expect(again.structuredContent.states[0].proposal).toBeNull();
      expect(await db.orm.select().from(schema.proposal)).toHaveLength(1);
    }));
});

describe("une valeur Figma invalide refuse toute la déclaration, sans état ni proposition", () => {
  it.each([
    [
      "d'un autre type que le token",
      { $value: { value: 16, unit: "px" } },
      /^states\[0\]\.figmaValue\.\$value/,
    ],
    [
      "identique à la valeur validée",
      { $value: PRIMARY_BLUE },
      /^states\[0\]\.figmaValue : Valeur identique à la valeur validée, déclarer synced$/,
    ],
    ["sans valeur", undefined, /^states\[0\]\.figmaValue : Valeur Figma requise$/],
  ])("une valeur Figma %s", (_, figmaValue, message) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedToken(app, db);

      const result = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [{ name: "couleur.fond", state: "diverged", figmaValue }],
      });
      const read = await getJson(app, { accessToken, path: `/projects/${projectId}/tokens` });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: expect.stringMatching(message) }],
      });
      expect(read.tokens[0]).not.toHaveProperty("figma");
      expect(await db.orm.select().from(schema.proposalBatch)).toEqual([]);
    }),
  );

  it("une valeur Figma sans un mode du projet nomme le mode manquant", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await seedModes(db, { projectId, modes: ["clair", "sombre"] });
      await addToken(app, {
        accessToken,
        projectId,
        token: {
          name: "couleur.fond",
          $type: "color",
          modes: { clair: PRIMARY_BLUE, sombre: PRIMARY_BLUE },
        },
      });

      const result = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [
          { name: "couleur.fond", state: "diverged", figmaValue: { modes: { clair: NIGHT_BLUE } } },
        ],
      });

      expect(result.content).toEqual([
        { type: "text", text: "states[0].figmaValue.modes.sombre : Valeur manquante pour ce mode" },
      ]);
    }));

  it("une valeur Figma sur un autre état est refusée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedToken(app, db);

      const result = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [{ name: "couleur.fond", state: "synced", figmaValue: { $value: NIGHT_BLUE } }],
      });

      expect(result.content).toEqual([
        { type: "text", text: "states[0].figmaValue : Réservée à un token divergent" },
      ]);
    }));
});

describe("chaque token divergent est comparé à son propre token validé", () => {
  it("la valeur Figma prend le type et la description de son token, pas d'un autre", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: { name: "arrondi.moyen", $type: "dimension", $value: { value: 16, unit: "px" } },
      });
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.fond", $description: "Fond des pages" }),
      });

      const declared = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [{ name: "couleur.fond", state: "diverged", figmaValue: { $value: NIGHT_BLUE } }],
      });
      const { batch } = declared.structuredContent.states[0].proposal;
      const reviewed = await getJson(app, { accessToken, path: `/proposal-batches/${batch.id}` });

      expect(reviewed.proposals[0].proposed).toEqual({
        $type: "color",
        $value: NIGHT_BLUE,
        $description: "Fond des pages",
      });
    }));

  it("deux tokens divergents reçoivent chacun leur proposition", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedToken(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.bord" }),
      });

      const declared = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [
          { name: "couleur.fond", state: "diverged", figmaValue: { $value: NIGHT_BLUE } },
          { name: "couleur.bord", state: "diverged", figmaValue: { $value: NIGHT_BLUE } },
        ],
      });
      const [fond, bord] = declared.structuredContent.states;
      const reviewed = await getJson(app, {
        accessToken,
        path: `/proposal-batches/${fond.proposal.batch.id}`,
      });

      expect(fond.proposal.id).not.toBe(bord.proposal.id);
      expect(
        reviewed.proposals.map(({ id, name }: { id: string; name: string }) => [name, id]),
      ).toEqual(
        expect.arrayContaining([
          ["couleur.fond", fond.proposal.id],
          ["couleur.bord", bord.proposal.id],
        ]),
      );
    }));
});

describe("chaque valeur Figma invalide tient sur sa ligne, dans l'ordre de la déclaration", () => {
  it.each([["bleu"], [[NIGHT_BLUE]], [null]])(
    "une valeur Figma %j qui n'est pas un objet est refusée",
    (figmaValue) =>
      withIdentityApp(async (app, db) => {
        const { accessToken, projectId } = await seedComparedToken(app, db);

        const result = await declareFigmaStates(app, {
          token: accessToken,
          projectId,
          states: [{ name: "couleur.fond", state: "diverged", figmaValue }],
        });

        expect(result.content).toEqual([
          { type: "text", text: "states[0].figmaValue : Objet attendu, avec $value ou modes" },
        ]);
      }),
  );

  it("une composante hors de l'intervalle nomme le champ de la valeur Figma", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedToken(app, db);

      const result = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [
          {
            name: "couleur.fond",
            state: "diverged",
            figmaValue: { $value: { colorSpace: "srgb", components: [0.1, 1.4, 0.4] } },
          },
        ],
      });

      expect(result.content).toEqual([
        {
          type: "text",
          text: "states[0].figmaValue.$value.components : Composante hors de l'intervalle 0 à 1",
        },
      ]);
    }));

  it("les refus suivent l'ordre des entrées, quelle que soit leur nature", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedToken(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.bord" }),
      });

      const result = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [
          { name: "couleur.fond", state: "diverged", figmaValue: { $value: PRIMARY_BLUE } },
          { name: "couleur.bord", state: "diverged", figmaValue: { $value: "bleu" } },
        ],
      });

      expect(result.content[0].text.split("\n")).toEqual([
        "states[0].figmaValue : Valeur identique à la valeur validée, déclarer synced",
        expect.stringMatching(/^states\[1\]\.figmaValue\.\$value : /),
      ]);
    }));
});
