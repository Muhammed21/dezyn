import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import { type App, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { addToken, historyOf } from "#testing/token-fixtures.ts";

const SIXTEEN_PX = { value: 16, unit: "px" };

const makeDimensionToken = (overrides: Record<string, unknown> = {}) => ({
  name: "espacement.moyen",
  $type: "dimension",
  $value: SIXTEEN_PX,
  ...overrides,
});

const BODY_TEXT = {
  fontFamily: ["Inter", "sans-serif"],
  fontSize: SIXTEEN_PX,
  fontWeight: "bold",
  lineHeight: 1.5,
  letterSpacing: { value: 0.01, unit: "rem" },
};

const makeTypographyToken = (overrides: Record<string, unknown> = {}) => ({
  name: "texte.corps",
  $type: "typography",
  $value: BODY_TEXT,
  ...overrides,
});

const refusalOf = async (app: App, db: PostgresDatabase, token: unknown) => {
  const { accessToken, projectId } = await seedProject(app, db);
  const response = await addToken(app, { accessToken, projectId, token });
  return { status: response.status, body: await response.json() };
};

describe("un membre ajoute une dimension (ADR 0010 §1)", () => {
  it.each([[SIXTEEN_PX], [{ value: 1.5, unit: "rem" }], [{ value: -4, unit: "px" }]])(
    "la dimension %j est Validée, avec son entrée token.created",
    ($value) =>
      withIdentityApp(async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const token = makeDimensionToken({ $value });

        const response = await addToken(app, { accessToken, projectId, token });

        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ ...token, status: "validated" });
        expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
          action: "token.created",
          after: token,
        });
      }),
  );

  it.each([
    ["une unité hors de px et rem", { value: 1, unit: "em" }, "$value.unit"],
    ["une valeur qui n'est pas un nombre", { value: "16", unit: "px" }, "$value.value"],
    ["une unité absente", { value: 16 }, "$value.unit"],
  ])("%s répond 400 en nommant le champ", (_case, $value, path) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeDimensionToken({ $value }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ errors: [{ path }] });
    }),
  );
});

describe("un membre ajoute une typographie (ADR 0010 §1)", () => {
  it.each([[BODY_TEXT], [{ ...BODY_TEXT, fontFamily: "Inter", fontWeight: 400 }]])(
    "la typographie %j est Validée, avec son entrée token.created",
    ($value) =>
      withIdentityApp(async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const token = makeTypographyToken({ $value });

        const response = await addToken(app, { accessToken, projectId, token });

        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ ...token, status: "validated" });
        expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
          action: "token.created",
          after: token,
        });
      }),
  );

  it.each(["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"])(
    "une typographie sans %s répond 400 en le nommant",
    (field) =>
      withIdentityApp(async (app, db) => {
        const { status, body } = await refusalOf(
          app,
          db,
          makeTypographyToken({ $value: { ...BODY_TEXT, [field]: undefined } }),
        );

        expect(status).toBe(400);
        expect(body).toMatchObject({ errors: [{ path: `$value.${field}` }] });
      }),
  );

  it.each([
    [
      "une graisse hors de 1 à 1000",
      { fontWeight: 1001 },
      "$value.fontWeight",
      "Graisse hors de l'intervalle 1 à 1000",
    ],
    ["une famille vide", { fontFamily: [] }, "$value.fontFamily", "Famille de police vide"],
  ])("%s répond 400 en nommant le champ", (_case, overrides, path, message) =>
    withIdentityApp(async (app, db) => {
      const { status, body } = await refusalOf(
        app,
        db,
        makeTypographyToken({ $value: { ...BODY_TEXT, ...overrides } }),
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({
        errors: [
          {
            path,
            message,
          },
        ],
      });
    }),
  );

  it.each([
    ["un mot-clé de graisse inconnu", { fontWeight: "gras" }, "$value.fontWeight"],
    ["une taille en em", { fontSize: { value: 1, unit: "em" } }, "$value.fontSize.unit"],
  ])("%s répond 400 en nommant le champ", (_case, overrides, path) =>
    withIdentityApp(async (app, db) => {
      const { status, body } = await refusalOf(
        app,
        db,
        makeTypographyToken({ $value: { ...BODY_TEXT, ...overrides } }),
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({ errors: [{ path }] });
    }),
  );
});

const SOFT_SHADOW = {
  color: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.25 },
  offsetX: { value: 0, unit: "px" },
  offsetY: { value: 2, unit: "px" },
  blur: { value: 4, unit: "px" },
  spread: { value: 0, unit: "px" },
};

const makeShadowToken = ($value: unknown) => ({
  name: "effet.ombre.douce",
  $type: "shadow",
  $value,
});

describe("un membre ajoute un effet d'ombre (ADR 0010 §1)", () => {
  it.each([[SOFT_SHADOW], [[SOFT_SHADOW, { ...SOFT_SHADOW, inset: true }]]])(
    "l'ombre %j est Validée, avec son entrée token.created",
    ($value) =>
      withIdentityApp(async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const token = makeShadowToken($value);

        const response = await addToken(app, { accessToken, projectId, token });

        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ ...token, status: "validated" });
        expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
          action: "token.created",
          after: token,
        });
      }),
  );

  it.each(["color", "offsetX", "offsetY", "blur", "spread"])(
    "une ombre sans %s répond 400 en le nommant",
    (field) =>
      withIdentityApp(async (app, db) => {
        const { status, body } = await refusalOf(
          app,
          db,
          makeShadowToken({ ...SOFT_SHADOW, [field]: undefined }),
        );

        expect(status).toBe(400);
        expect(body).toMatchObject({ errors: [{ path: `$value.${field}` }] });
      }),
  );

  it.each([
    ["une ombre sans couche", [], "$value", "Ombre sans couche"],
    [
      "un flou négatif dans la deuxième couche",
      [SOFT_SHADOW, { ...SOFT_SHADOW, blur: { value: -1, unit: "px" } }],
      "$value.1.blur",
      "Flou négatif",
    ],
    [
      "un flou négatif dans une couche seule",
      { ...SOFT_SHADOW, blur: { value: -1, unit: "px" } },
      "$value.blur",
      "Flou négatif",
    ],
    [
      "une couleur invalide dans une couche",
      [{ ...SOFT_SHADOW, color: { colorSpace: "srgb", components: [0, 0, 2] } }],
      "$value.0.color.components",
      "Composante hors de l'intervalle 0 à 1",
    ],
  ])("%s répond 400 en nommant le champ", (_case, $value, path, message) =>
    withIdentityApp(async (app, db) => {
      const { status, body } = await refusalOf(app, db, makeShadowToken($value));

      expect(status).toBe(400);
      expect(body).toMatchObject({ errors: [{ path, message }] });
    }),
  );

  it("une couche sans étalement, parmi plusieurs, répond 400 en la désignant", () =>
    withIdentityApp(async (app, db) => {
      const { status, body } = await refusalOf(
        app,
        db,
        makeShadowToken([SOFT_SHADOW, { ...SOFT_SHADOW, spread: undefined }]),
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({
        errors: [
          {
            path: "$value.1.spread",
          },
        ],
      });
    }));
});
