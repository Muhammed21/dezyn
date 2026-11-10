import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import { type App, BASE_URL, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedModes, seedProject } from "#testing/project-fixtures.ts";
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

describe("un membre ajoute une famille de police, une graisse ou un nombre (ADR 0028 §1)", () => {
  it.each([
    ["police.corps", "fontFamily", ["Inter", "sans-serif"]],
    ["police.titre", "fontFamily", "Inter"],
    ["graisse.forte", "fontWeight", 700],
    ["graisse.titre", "fontWeight", "semi-bold"],
    ["interligne.corps", "number", 1.5],
    ["calque.arriere", "number", -2],
  ])("le token %s de type %s est Validé, avec son entrée token.created", (name, $type, $value) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const token = { name, $type, $value };

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
    ["une famille vide", "fontFamily", [], "$value", "Famille de police vide"],
    ["un nom de famille vide", "fontFamily", "", "$value", "Famille de police vide"],
    ["une graisse sous 1", "fontWeight", 0, "$value", "Graisse hors de l'intervalle 1 à 1000"],
    [
      "une graisse au-delà de 1000",
      "fontWeight",
      1001,
      "$value",
      "Graisse hors de l'intervalle 1 à 1000",
    ],
    [
      "une graisse hors bornes dans un mode",
      "fontWeight",
      undefined,
      "modes.compact",
      "Graisse hors de l'intervalle 1 à 1000",
    ],
  ])("%s répond 400 en nommant le champ", (_case, $type, $value, path, message) =>
    withIdentityApp(async (app, db) => {
      const token =
        $value === undefined
          ? { name: "graisse.forte", $type, modes: { compact: 1001 } }
          : { name: "graisse.forte", $type, $value };

      const { status, body } = await refusalOf(app, db, token);

      expect(status).toBe(400);
      expect(body).toMatchObject({ errors: [{ path, message }] });
    }),
  );

  it.each([
    ["un mot-clé de graisse inconnu", "fontWeight", "gras", "Mot-clé de graisse inconnu"],
    ["un nombre en chaîne", "number", "1.5", "Nombre attendu"],
    [
      "une référence mal formée",
      "fontWeight",
      "{graisse.forte",
      "Référence attendue au format {nom.du.token}",
    ],
  ])("%s répond 400 en nommant le champ", (_case, $type, $value, message) =>
    withIdentityApp(async (app, db) => {
      const { status, body } = await refusalOf(app, db, { name: "valeur.a", $type, $value });

      expect(status).toBe(400);
      expect(body).toMatchObject({ errors: [{ path: "$value", message }] });
    }),
  );
});

const tokensOf = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) => {
  const response = await app.request(`${BASE_URL}/v1/projects/${projectId}/tokens`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return (await response.json()).tokens;
};

describe("une famille, une graisse ou un nombre se réfère à un token validé du même type (ADR 0028 §1)", () => {
  it.each([
    ["fontFamily", "Inter", ["Georgia", "serif"]],
    ["fontWeight", 400, "bold"],
    ["number", 1.2, 1.6],
  ])("un token %s à modes, l'un par référence, se relit à l'identique", ($type, base, other) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await seedModes(db, { projectId, modes: ["compact", "large"] });
      const token = {
        name: "valeur.semantique",
        $type,
        modes: { compact: "{valeur.base}", large: other },
      };
      await addToken(app, {
        accessToken,
        projectId,
        token: { name: "valeur.base", $type, modes: { compact: base, large: base } },
      });

      const response = await addToken(app, { accessToken, projectId, token });

      expect(response.status).toBe(201);
      expect(await tokensOf(app, { accessToken, projectId })).toContainEqual(
        expect.objectContaining({ ...token, status: "validated" }),
      );
    }),
  );

  it("une graisse qui se réfère à un nombre répond 400", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: { name: "valeur.base", $type: "number", $value: 400 },
      });

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: { name: "graisse.forte", $type: "fontWeight", $value: "{valeur.base}" },
      });

      expect(response.status).toBe(400);
    }));
});
