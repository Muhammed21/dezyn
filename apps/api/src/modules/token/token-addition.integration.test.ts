import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ADA, GRACE, obtainAccessToken, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject, seedProjectAsEditor } from "#testing/project-fixtures.ts";
import {
  ADDITION_CORRELATION_ID,
  addToken,
  historyOf,
  makeColorToken,
  PRIMARY_BLUE,
} from "#testing/token-fixtures.ts";
import { schema } from "@repo/db";

describe("un membre ajoute un token couleur, Validé d'emblée (ADR 0012 §2)", () => {
  it("un propriétaire ajoute une couleur décrite, et l'historique montre token.created", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId, spaceId, projectId } = await seedProject(app, db);
      const token = makeColorToken({ $description: "Fond des boutons" });

      const response = await addToken(app, { accessToken, projectId, token });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        id: expect.any(String),
        name: "couleur.fond.primaire",
        $type: "color",
        $value: PRIMARY_BLUE,
        $description: "Fond des boutons",
        status: "validated",
        replaced: null,
      });
      expect((await historyOf(app, { accessToken, projectId }))[0]).toEqual({
        id: expect.any(String),
        action: "token.created",
        spaceId,
        projectId,
        author: { kind: "member", userId, name: ADA.name },
        clientId: null,
        before: null,
        after: { ...token, replaced: null },
        occurredAt: expect.any(String),
        correlationId: ADDITION_CORRELATION_ID,
      });
    }));

  it("un éditeur ajoute une couleur sans description", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProjectAsEditor(app, db);

      const response = await addToken(app, { accessToken, projectId });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        id: expect.any(String),
        name: "couleur.fond.primaire",
        $type: "color",
        $value: PRIMARY_BLUE,
        status: "validated",
        replaced: null,
      });
      expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
        action: "token.created",
        after: makeColorToken(),
      });
    }));

  it("le même nom reste libre dans un autre projet", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const other = await seedProjectAsEditor(app, db, { user: GRACE });
      await addToken(app, { accessToken: other.accessToken, projectId: other.projectId });

      const response = await addToken(app, { accessToken, projectId });

      expect(response.status).toBe(201);
    }));
});

describe("seul un membre du projet ajoute un token", () => {
  it("un non-membre reçoit 404, sans token créé", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await seedProject(app, db);
      const grace = await obtainAccessToken(app, { user: GRACE });

      const response = await addToken(app, { accessToken: grace.accessToken, projectId });

      expect(response.status).toBe(404);
      expect(await db.orm.select().from(schema.token)).toEqual([]);
    }));

  it.each([[randomUUID()], ["pas-un-uuid"]])("le projet %s, inconnu, répond 404", (projectId) =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await addToken(app, { accessToken, projectId });

      expect(response.status).toBe(404);
    }),
  );

  it("si l'écriture de l'entrée échoue, le token n'est pas créé", () =>
    withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProjectAsEditor(app, db);

        const response = await addToken(app, { accessToken, projectId });

        expect(response.status).toBe(500);
        expect(await db.orm.select().from(schema.token)).toEqual([]);
        expect(await db.orm.select().from(schema.tokenValue)).toEqual([]);
      },
      {
        wrapHistoryWriter: () => ({
          append: () => Promise.reject(new Error("historique indisponible")),
        }),
      },
    ));
});

describe("un token invalide répond 400 problem+json, en nommant le champ", () => {
  it.each([
    ["un segment vide", { name: "couleur..primaire" }, "name", "Segment de nom vide"],
    ["un segment en $", { name: "couleur.$primaire" }, "name", "Segment de nom commençant par $"],
    ["une accolade", { name: "couleur.{primaire}" }, "name", "Accolade interdite dans un nom"],
    [
      "une composante hors bornes",
      { $value: { ...PRIMARY_BLUE, components: [0.2, 1.4, 0.8] } },
      "$value.components",
      "Composante hors de l'intervalle 0 à 1",
    ],
    [
      "un alpha hors bornes",
      { $value: { ...PRIMARY_BLUE, alpha: 1.5 } },
      "$value.alpha",
      "Alpha hors de l'intervalle 0 à 1",
    ],
    [
      "un hex mal formé",
      { $value: { ...PRIMARY_BLUE, hex: "#36c" } },
      "$value.hex",
      "Hex attendu au format #rrggbb",
    ],
    [
      "un hex qui contredit les composantes",
      { $value: { ...PRIMARY_BLUE, hex: "#3366cd" } },
      "$value.hex",
      "Hex différent des composantes",
    ],
  ])("%s", (_case, overrides, path, message) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken(overrides),
      });

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toMatchObject({ status: 400, errors: [{ path, message }] });
      expect(await db.orm.select().from(schema.token)).toEqual([]);
    }),
  );

  it("un nom déjà pris dans le projet répond 400 sur name, sans second token", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId });

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ $value: { colorSpace: "srgb", components: [1, 1, 1] } }),
      });

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Requête invalide",
        status: 400,
        errors: [{ path: "name", message: "Nom déjà pris dans le projet" }],
      });
      expect(await db.orm.select().from(schema.token)).toHaveLength(1);
      expect(
        (await historyOf(app, { accessToken, projectId })).filter(
          (entry: { action: string }) => entry.action === "token.created",
        ),
      ).toHaveLength(1);
    }));

  it.each([
    [
      "un autre espace colorimétrique",
      { $value: { ...PRIMARY_BLUE, colorSpace: "display-p3" } },
      "$value.colorSpace",
    ],
    [
      "deux composantes",
      { $value: { ...PRIMARY_BLUE, components: [0.2, 0.4] } },
      "$value.components",
    ],
    ["une valeur absente", { $value: undefined }, "$value"],
    ["une description qui n'est pas un texte", { $description: 3 }, "$description"],
  ])("%s répond 400 sur %s", (_case, overrides, path) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken(overrides),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ errors: [{ path }] });
    }),
  );

  it("un champ inconnu répond 400 en le nommant", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ $extensions: {} }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        errors: [{ message: expect.stringContaining("$extensions") }],
      });
    }));
});

describe("un type DTCG en attente est refusé en le nommant (ADR 0028 §3)", () => {
  it.each(["duration", "cubicBezier", "transition", "border", "strokeStyle"])(
    "un token %s répond 400 en nommant son type",
    ($type) =>
      withIdentityApp(async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);

        const response = await addToken(app, {
          accessToken,
          projectId,
          token: makeColorToken({ $type }),
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          errors: [{ path: "$type", message: `Le type ${$type} n'est pas encore pris en charge` }],
        });
      }),
  );

  it("un type inconnu de DTCG garde le refus de forme", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ $type: "pigment" }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        errors: [{ path: "$type", message: expect.stringMatching(/^Invalid discriminator value/) }],
      });
    }));
});
