import { describe, expect, it } from "vitest";

import { schema } from "@repo/db";

import { type App, BASE_URL, callMcp, withIdentityApp } from "../../testing/authorization-flow.ts";
import { seedModes, seedProject } from "../../testing/project-fixtures.ts";
import { addToken, historyOf, makeColorToken, PRIMARY_BLUE } from "../../testing/token-fixtures.ts";

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const callTool = async (
  app: App,
  { accessToken, name, args }: { accessToken: string; name: string; args: object },
) => {
  const response = await callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const { result } = await response.json();
  return result;
};

const writeTokens = (
  app: App,
  { accessToken, projectId, tokens }: { accessToken: string; projectId: string; tokens: object[] },
) => callTool(app, { accessToken, name: "write_tokens", args: { projectId, tokens } });

const readTokens = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) =>
  (await callTool(app, { accessToken, name: "read_tokens", args: { projectId } }))
    .structuredContent;

const request = (
  app: App,
  { accessToken, path, method = "GET" }: { accessToken: string; path: string; method?: string },
) =>
  app.request(`${BASE_URL}/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}` },
  });

describe("l'IA propose la modification d'un token validé (ADR 0012 §3)", () => {
  it("une autre valeur crée une proposition de modification, et la valeur validée fait toujours foi", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken() });

      const result = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });

      expect(result.structuredContent).toEqual({
        lot: { id: expect.any(String), state: "open" },
        propositions: [
          {
            id: expect.any(String),
            name: "couleur.fond.primaire",
            kind: "update",
            status: "proposed",
          },
        ],
        unchanged: [],
      });
      expect((await readTokens(app, { accessToken, projectId })).tokens).toMatchObject([
        { name: "couleur.fond.primaire", $value: PRIMARY_BLUE },
      ]);
    }));

  it("le lot montre la valeur validée et la valeur proposée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.bleu.500", $value: NIGHT_BLUE }),
      });
      await addToken(app, { accessToken, projectId, token: makeColorToken() });
      const { lot } = (
        await writeTokens(app, {
          accessToken,
          projectId,
          tokens: [makeColorToken({ $value: NIGHT_BLUE, $description: "Fond sombre" })],
        })
      ).structuredContent;

      const batch = await (
        await request(app, { accessToken, path: `/proposal-batches/${lot.id}` })
      ).json();

      expect(batch.propositions).toEqual([
        {
          id: expect.any(String),
          name: "couleur.fond.primaire",
          kind: "update",
          status: "proposed",
          validated: { $type: "color", $value: PRIMARY_BLUE },
          proposed: { $type: "color", $value: NIGHT_BLUE, $description: "Fond sombre" },
        },
      ]);
    }));

  it("un nom existant avec un autre type refuse l'appel", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken() });

      const result = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [
          { name: "couleur.fond.primaire", $type: "dimension", $value: { value: 16, unit: "px" } },
        ],
      });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "tokens[0].$type : Type différent du token validé" }],
      });
    }));
});

describe("un nouveau nom n'est comparé à aucun autre token", () => {
  it("un token d'un nouveau nom est proposé en création, quel que soit le type des autres", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: { name: "espacement.moyen", $type: "dimension", $value: { value: 16, unit: "px" } },
      });

      const result = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });

      expect(result.structuredContent.propositions).toMatchObject([
        { name: "couleur.fond.primaire", kind: "create" },
      ]);
    }));
});

describe("une écriture identique à la valeur validée ne crée rien (ADR 0013 §5)", () => {
  it("sans lot ouvert, rien n'est proposé, aucun lot ne s'ouvre, et la réponse le dit", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken() });

      const result = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });

      expect(result.structuredContent).toEqual({
        lot: null,
        propositions: [],
        unchanged: ["couleur.fond.primaire"],
      });
      expect(await db.orm.select().from(schema.propositionLot)).toEqual([]);
      expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
        action: "mcp.write_tokens",
        after: { outcome: "success" },
      });
    }));

  it("avec un lot ouvert, la réponse désigne ce lot", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken() });
      const opened = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.bleu.500" })],
      });

      const result = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });

      expect(result.structuredContent).toEqual({
        lot: opened.structuredContent.lot,
        propositions: [],
        unchanged: ["couleur.fond.primaire"],
      });
    }));

  it("sur un projet à modes, une valeur identique dans chaque mode ne crée rien, une seule différente crée une modification", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await seedModes(db, { projectId, modes: ["clair", "sombre"] });
      const modes = { clair: PRIMARY_BLUE, sombre: NIGHT_BLUE };
      await addToken(app, {
        accessToken,
        projectId,
        token: { name: "couleur.fond", $type: "color", modes },
      });

      const result = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [
          { name: "couleur.fond", $type: "color", modes },
          { name: "couleur.texte", $type: "color", modes },
        ],
      });
      const changed = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [
          { name: "couleur.fond", $type: "color", modes: { ...modes, sombre: PRIMARY_BLUE } },
        ],
      });

      expect(result.structuredContent).toMatchObject({
        propositions: [{ name: "couleur.texte", kind: "create" }],
        unchanged: ["couleur.fond"],
      });
      expect(changed.structuredContent).toMatchObject({
        propositions: [{ name: "couleur.fond", kind: "update" }],
        unchanged: [],
      });
    }));
});

describe("valider une modification fait de la valeur proposée la valeur validée", () => {
  it("read_tokens rend la nouvelle valeur, et l'historique garde l'ancienne", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken() });
      const proposed = makeColorToken({ $value: NIGHT_BLUE, $description: "Fond sombre" });
      const { propositions } = (
        await writeTokens(app, { accessToken, projectId, tokens: [proposed] })
      ).structuredContent;

      const response = await request(app, {
        accessToken,
        path: `/proposals/${propositions[0].id}/validate`,
        method: "POST",
      });

      expect(await response.json()).toMatchObject({ kind: "update", status: "validated" });
      expect((await readTokens(app, { accessToken, projectId })).tokens).toEqual([
        {
          id: expect.any(String),
          name: "couleur.fond.primaire",
          $type: "color",
          $value: NIGHT_BLUE,
          $description: "Fond sombre",
          status: "validated",
        },
      ]);
      expect(
        (await historyOf(app, { accessToken, projectId })).find(
          (entry: { action: string }) => entry.action === "proposition.validated",
        ),
      ).toMatchObject({
        before: { name: "couleur.fond.primaire", $type: "color", $value: PRIMARY_BLUE },
        after: { propositionId: propositions[0].id, token: proposed },
      });
    }));

  it("valider une modification qui référence un token encore proposé répond 409", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken() });
      const { propositions } = (
        await writeTokens(app, {
          accessToken,
          projectId,
          tokens: [
            makeColorToken({ name: "couleur.bleu.500" }),
            makeColorToken({ $value: "{couleur.bleu.500}" }),
          ],
        })
      ).structuredContent;

      const response = await request(app, {
        accessToken,
        path: `/proposals/${propositions[1].id}/validate`,
        method: "POST",
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        errors: [{ path: "$value", message: "Référence vers un token non validé" }],
      });
      expect((await readTokens(app, { accessToken, projectId })).tokens).toMatchObject([
        { name: "couleur.fond.primaire", $value: PRIMARY_BLUE },
      ]);
    }));

  it("sur un projet à modes, la validation remplace la valeur de chaque mode", () =>
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
      const { propositions } = (
        await writeTokens(app, {
          accessToken,
          projectId,
          tokens: [
            {
              name: "couleur.fond",
              $type: "color",
              modes: { clair: PRIMARY_BLUE, sombre: NIGHT_BLUE },
            },
          ],
        })
      ).structuredContent;

      await request(app, {
        accessToken,
        path: `/proposals/${propositions[0].id}/validate`,
        method: "POST",
      });

      expect((await readTokens(app, { accessToken, projectId })).tokens).toMatchObject([
        { name: "couleur.fond", modes: { clair: PRIMARY_BLUE, sombre: NIGHT_BLUE } },
      ]);
    }));
});
