import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import {
  type App,
  BASE_URL,
  callMcp,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { addToken, makeColorToken, PRIMARY_BLUE } from "#testing/token-fixtures.ts";
import { schema } from "@repo/db";

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const exportTokens = (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) =>
  app.request(`${BASE_URL}/v1/projects/${projectId}/tokens/export`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

const seedValidatedColor = async (
  db: PostgresDatabase,
  { projectId, name }: { readonly projectId: string; readonly name: string },
) => {
  const tokenId = randomUUID();
  await db.orm.insert(schema.token).values({
    id: tokenId,
    projectId,
    name,
    type: "color",
    description: null,
    status: "validated",
    createdAt: new Date(),
  });
  await db.orm.insert(schema.tokenValue).values({ id: randomUUID(), tokenId, value: PRIMARY_BLUE });
};

describe("un membre exporte un projet sans modes en document DTCG (ADR 0039 §2)", () => {
  it("les tokens validés sont imbriqués par groupes, avec leur type et leur valeur", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken() });
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.fond.secondaire", $value: NIGHT_BLUE }),
      });
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "bordure.forte" }),
      });

      const response = await exportTokens(app, { accessToken, projectId });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(await response.json()).toEqual({
        bordure: { forte: { $type: "color", $value: PRIMARY_BLUE } },
        couleur: {
          fond: {
            primaire: { $type: "color", $value: PRIMARY_BLUE },
            secondaire: { $type: "color", $value: NIGHT_BLUE },
          },
        },
      });
    }));

  it("un token garde sa description et ses extensions", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const $extensions = { "com.figma": { italic: true } };
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur", $description: "Couleur de marque", $extensions }),
      });

      const response = await exportTokens(app, { accessToken, projectId });

      expect(await response.json()).toEqual({
        couleur: {
          $type: "color",
          $value: PRIMARY_BLUE,
          $description: "Couleur de marque",
          $extensions,
        },
      });
    }));

  it("une référence est exportée telle qu'écrite", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken({ name: "bleu" }) });
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "marque", $value: "{bleu}" }),
      });

      const response = await exportTokens(app, { accessToken, projectId });

      expect(await response.json()).toEqual({
        bleu: { $type: "color", $value: PRIMARY_BLUE },
        marque: { $type: "color", $value: "{bleu}" },
      });
    }));

  it("une proposition en attente n'est pas exportée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken({ name: "bleu" }) });
      await callMcp(app, {
        token: accessToken,
        method: "tools/call",
        params: {
          name: "write_tokens",
          arguments: { projectId, tokens: [makeColorToken({ name: "rouge" })] },
        },
      });

      const response = await exportTokens(app, { accessToken, projectId });

      expect(await response.json()).toEqual({ bleu: { $type: "color", $value: PRIMARY_BLUE } });
    }));

  it("un projet sans token validé s'exporte en document vide", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await exportTokens(app, { accessToken, projectId });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({});
    }));

  it("deux tokens validés déjà en conflit de groupe font répondre 409", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.fond" }),
      });
      await seedValidatedColor(db, { projectId, name: "couleur" });

      const response = await exportTokens(app, { accessToken, projectId });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Export impossible",
        errors: [
          {
            path: "tokens.couleur",
            message: "Nom en conflit de groupe avec le token couleur.fond",
          },
        ],
      });
    }));
});

describe("seul un membre du projet exporte ses tokens", () => {
  it("un non-membre reçoit 404", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await seedProject(app, db);
      const grace = await obtainAccessToken(app, { user: GRACE });

      const response = await exportTokens(app, { accessToken: grace.accessToken, projectId });

      expect(response.status).toBe(404);
    }));

  it.each([[randomUUID()], ["pas-un-uuid"]])("le projet %s, inconnu, répond 404", (projectId) =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await exportTokens(app, { accessToken, projectId });

      expect(response.status).toBe(404);
    }),
  );
});
