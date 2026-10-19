import { describe, expect, it } from "vitest";

import {
  type App,
  authorizeAnotherAi,
  BASE_URL,
  callMcp,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "../../testing/authorization-flow.ts";
import { seedProject } from "../../testing/project-fixtures.ts";
import {
  addToken,
  historyOf,
  makeColorToken,
  PRIMARY_BLUE,
  seedValidatedToken,
} from "../../testing/token-fixtures.ts";

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
  return result.structuredContent;
};

const writeTokens = (
  app: App,
  { token, projectId, tokens }: { token: string; projectId: string; tokens: readonly object[] },
) => callTool(app, { token, name: "write_tokens", args: { projectId, tokens } });

const closeBatch = (app: App, { token, projectId }: { token: string; projectId: string }) =>
  callTool(app, { token, name: "close_proposal_batch", args: { projectId } });

const readTokenNames = async (
  app: App,
  { token, projectId }: { token: string; projectId: string },
): Promise<readonly string[]> =>
  (await callTool(app, { token, name: "read_tokens", args: { projectId } })).tokens.map(
    ({ name }: { name: string }) => name,
  );

const validateBatch = (
  app: App,
  { accessToken, lotId, body }: { accessToken: string; lotId: string; body?: object },
) =>
  app.request(`${BASE_URL}/v1/proposal-batches/${lotId}/validate`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const batchOf = async (app: App, { accessToken, lotId }: { accessToken: string; lotId: string }) =>
  (
    await app.request(`${BASE_URL}/v1/proposal-batches/${lotId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
  ).json();

const statusesOf = async (app: App, args: { accessToken: string; lotId: string }) =>
  Object.fromEntries(
    (await batchOf(app, args)).propositions.map(
      ({ name, status }: { name: string; status: string }) => [name, status],
    ),
  );

const seedClosedBatch = async (
  app: App,
  {
    accessToken,
    projectId,
    tokens,
  }: { accessToken: string; projectId: string; tokens: readonly object[] },
) => {
  const written = await writeTokens(app, { token: accessToken, projectId, tokens });
  await closeBatch(app, { token: accessToken, projectId });
  return written;
};

describe("seul un lot fermé se valide en entier (ADR 0013 §4)", () => {
  it("valider un lot ouvert répond 409, sans rien valider", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { lot } = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [makeColorToken()],
      });

      const response = await validateBatch(app, { accessToken, lotId: lot.id });

      expect(response.status).toBe(409);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Lot ouvert",
        status: 409,
      });
      expect(await statusesOf(app, { accessToken, lotId: lot.id })).toEqual({
        "couleur.fond.primaire": "proposed",
      });
    }));

  it("un lot fermé par expiration se valide", () => {
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

        const response = await validateBatch(app, { accessToken, lotId: lot.id });

        expect(response.status).toBe(200);
        expect(await readTokenNames(app, { token: accessToken, projectId })).toEqual([
          "couleur.fond.primaire",
        ]);
      },
      { clock: () => clock.instant },
    );
  });

  it("l'IA d'un non-membre ne valide pas le lot : 404", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { lot } = await seedClosedBatch(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });
      const grace = await obtainAccessToken(app, { user: GRACE });

      const response = await validateBatch(app, { accessToken: grace.accessToken, lotId: lot.id });

      expect(response.status).toBe(404);
      expect(await statusesOf(app, { accessToken, lotId: lot.id })).toEqual({
        "couleur.fond.primaire": "proposed",
      });
    }));

  it("un identifiant de lot qui n'est pas un UUID répond 404", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await seedProject(app, db);

      const response = await validateBatch(app, { accessToken, lotId: "pas-un-uuid" });

      expect(response.status).toBe(404);
    }));

  it("un lot inconnu répond 404", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await seedProject(app, db);

      const response = await validateBatch(app, {
        accessToken,
        lotId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
      });

      expect(response.status).toBe(404);
    }));
});

describe("valider un lot fermé valide ses propositions Proposées, sauf celles rejetées (ADR 0012 §4)", () => {
  it("les propositions sont validées ou rejetées, et lisibles par read_tokens", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { lot, propositions } = await seedClosedBatch(app, {
        accessToken,
        projectId,
        tokens: [
          makeColorToken({ name: "couleur.bleu.500" }),
          makeColorToken({ name: "couleur.bleu.600" }),
          makeColorToken({ name: "couleur.bleu.700" }),
        ],
      });

      const response = await validateBatch(app, {
        accessToken,
        lotId: lot.id,
        body: { rejected: [propositions[1].id] },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id: lot.id,
        state: "closed",
        validated: expect.arrayContaining([propositions[0].id, propositions[2].id]),
        rejected: [propositions[1].id],
      });
      expect(await statusesOf(app, { accessToken, lotId: lot.id })).toEqual({
        "couleur.bleu.500": "validated",
        "couleur.bleu.600": "rejected",
        "couleur.bleu.700": "validated",
      });
      expect(await readTokenNames(app, { token: accessToken, projectId })).toEqual([
        "couleur.bleu.500",
        "couleur.bleu.700",
      ]);
    }));

  it("sans corps, toutes les propositions Proposées sont validées", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { lot, propositions } = await seedClosedBatch(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });

      const response = await app.request(`${BASE_URL}/v1/proposal-batches/${lot.id}/validate`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(await response.json()).toMatchObject({
        validated: [propositions[0].id],
        rejected: [],
      });
    }));

  it("chaque validation et chaque rejet entre dans l'historique", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId, projectId } = await seedProject(app, db);
      const { lot, propositions } = await seedClosedBatch(app, {
        accessToken,
        projectId,
        tokens: [
          makeColorToken({ name: "couleur.bleu.500" }),
          makeColorToken({ name: "couleur.bleu.600" }),
        ],
      });

      await validateBatch(app, {
        accessToken,
        lotId: lot.id,
        body: { rejected: [propositions[1].id] },
      });
      const entries = await historyOf(app, { accessToken, projectId });

      expect(
        entries.filter(({ action }: { action: string }) => action.startsWith("proposition.")),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "proposition.validated",
            author: expect.objectContaining({ userId }),
            clientId: null,
            after: expect.objectContaining({ propositionId: propositions[0].id }),
          }),
          expect.objectContaining({
            action: "proposition.rejected",
            after: expect.objectContaining({ propositionId: propositions[1].id }),
          }),
        ]),
      );
    }));

  it("un rejet qui désigne une proposition hors du lot répond 400, sans rien valider", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { lot, propositions } = await seedClosedBatch(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });
      const elsewhere = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

      const response = await validateBatch(app, {
        accessToken,
        lotId: lot.id,
        body: { rejected: [propositions[0].id, elsewhere] },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Requête invalide",
        errors: [{ path: "rejected.1", message: "Proposition hors du lot" }],
      });
      expect(await statusesOf(app, { accessToken, lotId: lot.id })).toEqual({
        "couleur.fond.primaire": "proposed",
      });
    }));

  it("un rejet qui n'est pas un identifiant répond 400", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { lot } = await seedClosedBatch(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });

      const response = await validateBatch(app, {
        accessToken,
        lotId: lot.id,
        body: { rejected: ["pas-un-uuid"] },
      });

      expect(response.status).toBe(400);
    }));
});

describe("valider un lot valide aussi les modifications proposées (ADR 0013 §8)", () => {
  it("la valeur proposée remplace la valeur validée, et l'historique garde l'ancienne", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken() });
      const { lot } = await seedClosedBatch(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });

      await validateBatch(app, { accessToken, lotId: lot.id });
      const { tokens } = await callTool(app, {
        token: accessToken,
        name: "read_tokens",
        args: { projectId },
      });
      const entries = await historyOf(app, { accessToken, projectId });

      expect(tokens).toMatchObject([{ name: "couleur.fond.primaire", $value: NIGHT_BLUE }]);
      expect(
        entries.find(({ action }: { action: string }) => action === "proposition.validated"),
      ).toMatchObject({
        before: { name: "couleur.fond.primaire", $value: PRIMARY_BLUE },
        after: { token: { $value: NIGHT_BLUE } },
      });
    }));
});

describe("une proposition Remplacée pendant la relecture n'est pas validée (ADR 0013 §9)", () => {
  it("la proposition remplacée par l'écriture d'une autre IA reste Remplacée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, browser, projectId } = await seedProject(app, db);
      const { lot } = await seedClosedBatch(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken(), makeColorToken({ name: "couleur.bleu.500" })],
      });
      const other = await authorizeAnotherAi(app, { browser, clientName: "Cursor" });
      await writeTokens(app, {
        token: other.accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });

      const response = await validateBatch(app, { accessToken, lotId: lot.id });

      expect(await response.json()).toMatchObject({ validated: [expect.any(String)] });
      expect(await statusesOf(app, { accessToken, lotId: lot.id })).toEqual({
        "couleur.fond.primaire": "replaced",
        "couleur.bleu.500": "validated",
      });
      expect(await readTokenNames(app, { token: accessToken, projectId })).toEqual([
        "couleur.bleu.500",
      ]);
    }));

  it("la proposition remplacée par l'ajout d'un membre n'est pas validée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { lot } = await seedClosedBatch(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $value: NIGHT_BLUE })],
      });
      await addToken(app, { accessToken, projectId, token: makeColorToken() });

      const response = await validateBatch(app, { accessToken, lotId: lot.id });

      expect(await response.json()).toMatchObject({ validated: [], rejected: [] });
      expect(await statusesOf(app, { accessToken, lotId: lot.id })).toEqual({
        "couleur.fond.primaire": "replaced",
      });
    }));
});

describe("un lot se valide cibles d'abord, et tout ou rien", () => {
  it("un token écrit avant le token qu'il référence se valide après lui", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { lot } = await seedClosedBatch(app, {
        accessToken,
        projectId,
        tokens: [
          makeColorToken({ name: "couleur.fond.primaire", $value: "{couleur.bleu.500}" }),
          makeColorToken({ name: "couleur.bleu.500" }),
        ],
      });

      const response = await validateBatch(app, { accessToken, lotId: lot.id });

      expect(response.status).toBe(200);
      expect(await readTokenNames(app, { token: accessToken, projectId })).toEqual([
        "couleur.bleu.500",
        "couleur.fond.primaire",
      ]);
    }));

  it("rejeter la cible d'une référence du lot répond 409, sans rien valider", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { lot, propositions } = await seedClosedBatch(app, {
        accessToken,
        projectId,
        tokens: [
          makeColorToken({ name: "couleur.bleu.700" }),
          makeColorToken({ name: "couleur.fond.primaire", $value: "{couleur.bleu.500}" }),
          makeColorToken({ name: "couleur.bleu.500" }),
        ],
      });

      const response = await validateBatch(app, {
        accessToken,
        lotId: lot.id,
        body: { rejected: [propositions[2].id] },
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Lot invalide",
        status: 409,
        errors: [
          {
            path: `propositions.${propositions[1].id}.$value`,
            message: "Référence vers un token non validé",
          },
        ],
      });
      expect(await statusesOf(app, { accessToken, lotId: lot.id })).toEqual({
        "couleur.bleu.700": "proposed",
        "couleur.fond.primaire": "proposed",
        "couleur.bleu.500": "proposed",
      });
      expect(await readTokenNames(app, { token: accessToken, projectId })).toEqual([]);
    }));

  it("un nom pris entre-temps répond 409 sur ce nom, et annule les validations du lot", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { lot, propositions } = await seedClosedBatch(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.bleu.500" }), makeColorToken()],
      });
      await seedValidatedToken(db, { projectId, name: "couleur.fond.primaire" });

      const response = await validateBatch(app, { accessToken, lotId: lot.id });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        title: "Lot invalide",
        errors: [
          {
            path: `propositions.${propositions[1].id}.name`,
            message: "Nom déjà pris dans le projet",
          },
        ],
      });
      expect(await statusesOf(app, { accessToken, lotId: lot.id })).toEqual({
        "couleur.bleu.500": "proposed",
        "couleur.fond.primaire": "proposed",
      });
      expect(await readTokenNames(app, { token: accessToken, projectId })).not.toContain(
        "couleur.bleu.500",
      );
    }));

  it("si l'historique échoue, rien n'est validé", () =>
    withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const { lot } = await seedClosedBatch(app, {
          accessToken,
          projectId,
          tokens: [makeColorToken({ name: "couleur.bleu.500" }), makeColorToken()],
        });

        const response = await validateBatch(app, { accessToken, lotId: lot.id });

        expect(response.status).toBe(500);
        expect(await statusesOf(app, { accessToken, lotId: lot.id })).toEqual({
          "couleur.bleu.500": "proposed",
          "couleur.fond.primaire": "proposed",
        });
      },
      {
        wrapHistoryWriter: (writer) => ({
          append: (entry) =>
            entry.action === "proposition.validated" &&
            JSON.stringify(entry.after).includes("couleur.fond.primaire")
              ? Promise.reject(new Error("historique indisponible"))
              : writer.append(entry),
        }),
      },
    ));
});
