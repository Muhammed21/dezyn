import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  callMcp,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { seedProject, seedProjectAsEditor } from "#testing/project-fixtures.ts";
import { addToken, historyOf, makeColorToken, seedProposedToken } from "#testing/token-fixtures.ts";

const DECLARATION_CORRELATION_ID = "comparaison-figma-1";

const callTool = async (
  app: App,
  { token, name, args }: { token: string; name: string; args: object },
) => {
  const response = await callMcp(app, {
    token,
    method: "tools/call",
    params: { name, arguments: args },
    correlationId: DECLARATION_CORRELATION_ID,
  });
  const { result } = await response.json();
  return result;
};

const declareFigmaStates = (
  app: App,
  { token, projectId, states }: { token: string; projectId: string; states: unknown },
) => callTool(app, { token, name: "declare_figma_states", args: { projectId, states } });

const readTokensOverHttp = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) => {
  const response = await app.request(`${BASE_URL}/v1/projects/${projectId}/tokens`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return { status: response.status, body: await response.json() };
};

const seedComparedProject = async (app: App, db: Parameters<typeof seedProject>[1]) => {
  const seeded = await seedProject(app, db);
  await addToken(app, { ...seeded, token: makeColorToken({ name: "couleur.fond" }) });
  await addToken(app, { ...seeded, token: makeColorToken({ name: "couleur.bord" }) });
  await addToken(app, { ...seeded, token: makeColorToken({ name: "couleur.texte" }) });
  return seeded;
};

describe("l'IA déclare l'état Figma de plusieurs tokens en un appel, sans relecture (ADR 0024 §1, §3)", () => {
  it("les membres et l'IA lisent l'état, sa date et son auteur ; un token jamais comparé n'en a pas", () => {
    const clock = { instant: new Date("2026-10-19T09:00:00.000Z") };
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId, userId } = await seedComparedProject(app, db);

        const declared = await declareFigmaStates(app, {
          token: accessToken,
          projectId,
          states: [
            { name: "couleur.fond", state: "synced" },
            { name: "couleur.bord", state: "missing_in_figma" },
          ],
        });
        const [entry] = await historyOf(app, { accessToken, projectId });
        const overHttp = await readTokensOverHttp(app, { accessToken, projectId });
        const overMcp = await callTool(app, {
          token: accessToken,
          name: "read_tokens",
          args: { projectId },
        });

        expect(declared.structuredContent).toEqual({
          states: [
            { name: "couleur.fond", state: "synced", declaredAt: "2026-10-19T09:00:00.000Z" },
            {
              name: "couleur.bord",
              state: "missing_in_figma",
              declaredAt: "2026-10-19T09:00:00.000Z",
            },
          ],
        });
        expect(declared.content).toEqual([
          { type: "text", text: JSON.stringify(declared.structuredContent) },
        ]);
        const figmaOf = (state: string) => ({
          state,
          declaredAt: "2026-10-19T09:00:00.000Z",
          author: { kind: "member", userId, name: ADA.name },
          clientId: entry.clientId,
        });
        expect(overHttp.status).toBe(200);
        expect(overHttp.body.tokens).toEqual([
          expect.objectContaining({ name: "couleur.bord", figma: figmaOf("missing_in_figma") }),
          expect.objectContaining({ name: "couleur.fond", figma: figmaOf("synced") }),
          expect.not.objectContaining({ figma: expect.anything() }),
        ]);
        expect(overMcp.structuredContent).toEqual(overHttp.body);
        expect(entry).toMatchObject({
          action: "mcp.declare_figma_states",
          clientId: expect.any(String),
          correlationId: DECLARATION_CORRELATION_ID,
          after: {
            outcome: "success",
            input: {
              states: [
                { name: "couleur.fond", state: "synced" },
                { name: "couleur.bord", state: "missing_in_figma" },
              ],
            },
          },
        });
      },
      { clock: () => clock.instant },
    );
  });
});

describe("une nouvelle déclaration remplace l'état précédent du token (ADR 0024 §3)", () => {
  it("la lecture rend le dernier état déclaré, à sa date", () => {
    const clock = { instant: new Date("2026-10-19T09:00:00.000Z") };
    return withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedComparedProject(app, db);
        await declareFigmaStates(app, {
          token: accessToken,
          projectId,
          states: [
            { name: "couleur.fond", state: "synced" },
            { name: "couleur.bord", state: "synced" },
          ],
        });
        clock.instant = new Date("2026-10-19T10:00:00.000Z");

        await declareFigmaStates(app, {
          token: accessToken,
          projectId,
          states: [{ name: "couleur.fond", state: "missing_in_figma" }],
        });
        const { body } = await readTokensOverHttp(app, { accessToken, projectId });

        expect(body.tokens).toMatchObject([
          {
            name: "couleur.bord",
            figma: { state: "synced", declaredAt: "2026-10-19T09:00:00.000Z" },
          },
          {
            name: "couleur.fond",
            figma: { state: "missing_in_figma", declaredAt: "2026-10-19T10:00:00.000Z" },
          },
          { name: "couleur.texte" },
        ]);
      },
      { clock: () => clock.instant },
    );
  });
});

describe("une déclaration invalide est refusée en entier, avec la liste des entrées en erreur", () => {
  it("un token inconnu et un état inconnu refusent tout l'appel, sans rien changer", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedProject(app, db);

      const result = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [
          { name: "couleur.fond", state: "synced" },
          { name: "couleur.inconnue", state: "synced" },
          { name: "couleur.bord", state: "en_retard" },
        ],
      });
      const { body } = await readTokensOverHttp(app, { accessToken, projectId });

      expect(result).toMatchObject({
        isError: true,
        content: [
          {
            type: "text",
            text: "states[1].name : Token inconnu du projet\nstates[2].state : État Figma inconnu",
          },
        ],
      });
      expect(result.structuredContent).toBeUndefined();
      expect(body.tokens).toEqual([
        expect.not.objectContaining({ figma: expect.anything() }),
        expect.not.objectContaining({ figma: expect.anything() }),
        expect.not.objectContaining({ figma: expect.anything() }),
      ]);
      expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
        action: "mcp.declare_figma_states",
        after: { outcome: "error" },
      });
    }));

  it("un token qui n'existe qu'en proposition est inconnu de la déclaration", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedProject(app, db);
      await seedProposedToken(db, { projectId, name: "couleur.accent" });

      const result = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [{ name: "couleur.accent", state: "synced" }],
      });

      expect(result.content).toEqual([
        { type: "text", text: "states[0].name : Token inconnu du projet" },
      ]);
    }));

  it("chaque entrée mal formée tient sur sa ligne", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedProject(app, db);

      const result = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [{ name: "couleur.fond" }, { state: "synced" }],
      });

      expect(result.content[0].text.split("\n")).toEqual([
        expect.stringMatching(/^states\[0\]\.state : /),
        expect.stringMatching(/^states\[1\]\.name : /),
      ]);
    }));

  it("un token nommé deux fois refuse la déclaration", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedProject(app, db);

      const result = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [
          { name: "couleur.fond", state: "synced" },
          { name: "couleur.fond", state: "missing_in_figma" },
        ],
      });

      expect(result.content).toEqual([
        { type: "text", text: "states[1].name : Token déjà nommé dans cette déclaration" },
      ]);
    }));

  it.each([
    ["sans entrée", []],
    ["sans liste", undefined],
    ["une entrée sans état", [{ name: "couleur.fond" }]],
  ])("une déclaration %s est refusée en nommant le champ", (_, states) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedProject(app, db);

      const result = await declareFigmaStates(app, { token: accessToken, projectId, states });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: expect.stringMatching(/^states(\[0\]\.state)? : /) }],
      });
    }),
  );
});

describe("seuls les membres du projet déclarent et lisent l'état Figma (ADR 0017)", () => {
  it("un éditeur déclare l'état Figma", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProjectAsEditor(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.fond" }),
      });

      const result = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [{ name: "couleur.fond", state: "synced" }],
      });

      expect(result.structuredContent.states).toMatchObject([
        { name: "couleur.fond", state: "synced" },
      ]);
    }));

  it("l'IA d'un non-membre reçoit « Projet introuvable », sans rien changer", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedProject(app, db);
      const grace = await obtainAccessToken(app, { user: GRACE });

      const result = await declareFigmaStates(app, {
        token: grace.accessToken,
        projectId,
        states: [{ name: "couleur.fond", state: "synced" }],
      });
      const { body } = await readTokensOverHttp(app, { accessToken, projectId });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "Projet introuvable" }],
      });
      expect(body.tokens[1]).not.toHaveProperty("figma");
    }));

  it("un non-membre, un projet inconnu ou un identifiant mal formé répondent 404 à la lecture", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await seedProject(app, db);
      const grace = await obtainAccessToken(app, { user: GRACE });

      const statuses = await Promise.all(
        [projectId, "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b", "pas-un-uuid"].map(
          async (id) =>
            (await readTokensOverHttp(app, { accessToken: grace.accessToken, projectId: id }))
              .status,
        ),
      );

      expect(statuses).toEqual([404, 404, 404]);
    }));
});

describe("declare_figma_states s'annonce à l'IA", () => {
  it("tools/list annonce l'outil, son entrée et les états connus de sa sortie", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await callMcp(app, { token: accessToken, method: "tools/list" });

      expect(await response.json()).toMatchObject({
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "declare_figma_states",
              description:
                "Déclare l'état Figma de tokens d'un projet, après comparaison avec Figma : synced si la variable Figma a la même valeur dans chaque mode, missing_in_figma si elle n'existe pas, duplicate_in_figma si plusieurs variables Figma correspondent au token, avec leurs noms dans figmaVariables (au moins deux), diverged si la valeur Figma diffère dans au moins un mode, avec cette valeur dans figmaValue ($value ou modes) : elle devient une proposition dans le lot ouvert de l'IA, ou dans un lot automatique. La déclaration s'applique sans relecture et remplace l'état précédent ; une entrée invalide refuse toute la déclaration.",
              inputSchema: expect.objectContaining({
                required: ["projectId"],
                properties: expect.objectContaining({ states: expect.anything() }),
              }),
              outputSchema: expect.objectContaining({
                properties: expect.objectContaining({ states: expect.anything() }),
              }),
            }),
          ]),
        },
      });
    }));
});

describe("l'IA déclare un doublon dans Figma avec ses variables Figma (ADR 0024 §2)", () => {
  const FIGMA_VARIABLES = ["Couleurs/Fond", "Legacy/Fond"];

  it("la déclaration et la lecture rendent les variables Figma du doublon", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedProject(app, db);

      const declared = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [
          { name: "couleur.fond", state: "duplicate_in_figma", figmaVariables: FIGMA_VARIABLES },
          { name: "couleur.bord", state: "synced" },
        ],
      });
      const overHttp = await readTokensOverHttp(app, { accessToken, projectId });
      const overMcp = await callTool(app, {
        token: accessToken,
        name: "read_tokens",
        args: { projectId },
      });

      expect(declared.structuredContent.states).toEqual([
        {
          name: "couleur.fond",
          state: "duplicate_in_figma",
          figmaVariables: FIGMA_VARIABLES,
          declaredAt: expect.any(String),
        },
        { name: "couleur.bord", state: "synced", declaredAt: expect.any(String) },
      ]);
      expect(overHttp.body.tokens[0].figma).not.toHaveProperty("figmaVariables");
      expect(overHttp.body.tokens[1].figma).toMatchObject({
        state: "duplicate_in_figma",
        figmaVariables: FIGMA_VARIABLES,
      });
      expect(overMcp.structuredContent).toEqual(overHttp.body);
    }));

  it("une déclaration synced efface les variables Figma du doublon", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedProject(app, db);
      await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [
          { name: "couleur.fond", state: "duplicate_in_figma", figmaVariables: FIGMA_VARIABLES },
        ],
      });

      await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [{ name: "couleur.fond", state: "synced" }],
      });
      const { body } = await readTokensOverHttp(app, { accessToken, projectId });

      expect(body.tokens[1].figma).toMatchObject({ state: "synced" });
      expect(body.tokens[1].figma).not.toHaveProperty("figmaVariables");
    }));

  it("un doublon sans deux variables et des variables sur un autre état refusent la déclaration", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedComparedProject(app, db);

      const result = await declareFigmaStates(app, {
        token: accessToken,
        projectId,
        states: [
          { name: "couleur.fond", state: "duplicate_in_figma", figmaVariables: ["Couleurs/Fond"] },
          { name: "couleur.bord", state: "synced", figmaVariables: FIGMA_VARIABLES },
        ],
      });

      expect(result.content).toEqual([
        {
          type: "text",
          text: "states[0].figmaVariables : Au moins deux variables Figma distinctes\nstates[1].figmaVariables : Réservé à un doublon dans Figma",
        },
      ]);
    }));
});
