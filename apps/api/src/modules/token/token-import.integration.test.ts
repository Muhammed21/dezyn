import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  type App,
  BASE_URL,
  callMcp,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { seedModes, seedProject, seedProjectAsEditor } from "#testing/project-fixtures.ts";
import { addToken, historyOf, makeColorToken, PRIMARY_BLUE } from "#testing/token-fixtures.ts";
import { schema } from "@repo/db";

const IMPORT_CORRELATION_ID = "import-des-tokens-1";

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const SIXTEEN_PX = { value: 16, unit: "px" };

const importTokens = (
  app: App,
  {
    accessToken,
    projectId,
    document,
  }: { accessToken: string; projectId: string; document: unknown },
) =>
  app.request(`${BASE_URL}/v1/projects/${projectId}/tokens/import`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-correlation-id": IMPORT_CORRELATION_ID,
    },
    body: JSON.stringify(document),
  });

const exportedDocument = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) => {
  const response = await app.request(`${BASE_URL}/v1/projects/${projectId}/tokens/export`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return response.json();
};

const color = (value: unknown) => ({ $type: "color", $value: value });

const documentOf = (count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`couleur${index}`, color(PRIMARY_BLUE)]),
  );

const tokenCreations = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) =>
  (await historyOf(app, { accessToken, projectId })).filter(
    ({ action }: { action: string }) => action === "token.created",
  );

const invalidDocument = (errors: readonly { path: string; message: unknown }[]) => ({
  type: "about:blank",
  title: "Document invalide",
  status: 400,
  errors,
});

describe("un membre importe un document DTCG dans un projet sans modes (ADR 0041)", () => {
  it("un document imbriqué devient des tokens validés, et la réponse résume l'import", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { couleur: { fond: { primaire: color(PRIMARY_BLUE) } } },
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ imported: 1, modes: [] });
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({
        couleur: { fond: { primaire: color(PRIMARY_BLUE) } },
      });
    }));

  it("un document exporté, importé dans un projet vide, ressort identique de l'export", () =>
    withIdentityApp(async (app, db) => {
      const source = await seedProject(app, db);
      const $extensions = { "com.figma": { italic: true } };
      const tokens = [
        makeColorToken({ name: "couleur.base", $description: "Bleu de marque", $extensions }),
        makeColorToken({ name: "couleur.fond", $value: "{couleur.base}" }),
        { name: "espace.moyen", $type: "dimension", $value: SIXTEEN_PX },
        {
          name: "ombre.douce",
          $type: "shadow",
          $value: {
            color: "{couleur.base}",
            offsetX: { value: 0, unit: "px" },
            offsetY: { value: 2, unit: "px" },
            blur: { value: 4, unit: "px" },
            spread: { value: 0, unit: "px" },
          },
        },
      ];
      await tokens.reduce(
        (previous, token) =>
          previous.then(() =>
            addToken(app, { accessToken: source.accessToken, projectId: source.projectId, token }),
          ),
        Promise.resolve(new Response()),
      );
      const exported = await exportedDocument(app, source);
      const target = await seedProjectAsEditor(app, db, { user: GRACE });

      const response = await importTokens(app, { ...target, document: exported });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ imported: 4, modes: [] });
      expect(await exportedDocument(app, target)).toEqual(exported);
    }));

  it("une référence vise un token placé plus loin dans le document, ou un token validé du projet", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken({ name: "bleu" }) });

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { accent: color("{marque}"), marque: color("{bleu}") },
      });

      expect(response.status).toBe(201);
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({
        accent: color("{marque}"),
        bleu: color(PRIMARY_BLUE),
        marque: color("{bleu}"),
      });
    }));

  it("une référence cassée répond 400 sur le token, sans rien écrire", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { bleu: color(PRIMARY_BLUE), marque: color("{rouge}") },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          { path: "tokens.marque.$value", message: "Référence vers un token inexistant" },
        ]),
      );
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({});
    }));

  it("toutes les erreurs du document reviennent dans le même 400, sans rien écrire", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: {
          duree: { $type: "duration", $value: { value: 100, unit: "ms" } },
          rouge: color("rouge"),
          couleur: { $type: "color", $value: PRIMARY_BLUE, fond: color(NIGHT_BLUE) },
          bleu: color(PRIMARY_BLUE),
        },
      });

      expect(response.status).toBe(400);
      const { errors } = await response.json();
      expect(errors).toEqual(
        expect.arrayContaining([
          {
            path: "tokens.duree.$type",
            message: "Le type duration n'est pas encore pris en charge",
          },
          { path: "tokens.rouge.$value", message: expect.any(String) },
          {
            path: "tokens.couleur",
            message: "Nom en conflit de groupe avec le token couleur.fond",
          },
        ]),
      );
      expect(errors.map(({ path }: { path: string }) => path)).not.toContain("tokens.bleu");
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({});
    }));

  it("un nom de token invalide répond 400 sur ce token", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { couleur: { "{bleu}": color(PRIMARY_BLUE) } },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          { path: "tokens.couleur.{bleu}", message: "Accolade interdite dans un nom" },
        ]),
      );
    }));

  it("un token qui se référence lui-même répond 400", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { boucle: color("{boucle}") },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          { path: "tokens.boucle.$value", message: "Référence vers un token inexistant" },
        ]),
      );
    }));

  it("deux tokens qui se référencent l'un l'autre répondent 400 sur chacun, sans rien écrire", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { fond: color("{texte}"), texte: color("{fond}") },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          { path: "tokens.fond.$value", message: "Référence circulaire" },
          { path: "tokens.texte.$value", message: "Référence circulaire" },
        ]),
      );
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({});
    }));

  it("un cycle de trois tokens répond 400 sur ses membres, pas sur le token qui le référence", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: {
          bordure: color("{fond}"),
          fond: color("{texte}"),
          texte: color("{lien}"),
          lien: color("{fond}"),
        },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          { path: "tokens.fond.$value", message: "Référence circulaire" },
          { path: "tokens.texte.$value", message: "Référence circulaire" },
          { path: "tokens.lien.$value", message: "Référence circulaire" },
        ]),
      );
    }));

  it("une clé qui contient un point répond 400 sur cette clé", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { "couleur.bleu": color(PRIMARY_BLUE), couleur: { bleu: color(NIGHT_BLUE) } },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([{ path: "tokens.couleur.bleu", message: "Point interdit dans un nom" }]),
      );
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({});
    }));

  it("un token qui référence un token du document et un token du projet s'écrit après le premier", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: { name: "taille.base", $type: "dimension", $value: SIXTEEN_PX },
      });
      const titre = {
        $type: "typography",
        $value: {
          fontFamily: "{police}",
          fontSize: "{taille.base}",
          fontWeight: "bold",
          lineHeight: 1.5,
          letterSpacing: { value: 0, unit: "px" },
        },
      };

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { titre, police: { $type: "fontFamily", $value: "Inter" } },
      });

      expect(response.status).toBe(201);
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({
        police: { $type: "fontFamily", $value: "Inter" },
        taille: { base: { $type: "dimension", $value: SIXTEEN_PX } },
        titre,
      });
    }));

  it("deux imports simultanés du même nom en écrivent un seul, l'autre répond 409 sans rien écrire", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const document = { bleu: color(PRIMARY_BLUE), rouge: color(NIGHT_BLUE) };

      const responses = await Promise.all([
        importTokens(app, { accessToken, projectId, document }),
        importTokens(app, { accessToken, projectId, document }),
      ]);

      expect(responses.map(({ status }) => status).toSorted((a, b) => a - b)).toEqual([201, 409]);
      expect(await tokenCreations(app, { accessToken, projectId })).toHaveLength(2);
    }));

  it("un nom déjà validé dans le projet répond 409 en nommant chaque token, sans rien écrire", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken({ name: "bleu" }) });
      await addToken(app, { accessToken, projectId, token: makeColorToken({ name: "vert" }) });

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { bleu: color(NIGHT_BLUE), rouge: color(NIGHT_BLUE), vert: color(NIGHT_BLUE) },
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Import impossible",
        status: 409,
        errors: [
          { path: "tokens.bleu", message: "Token déjà présent dans le projet" },
          { path: "tokens.vert", message: "Token déjà présent dans le projet" },
        ],
      });
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({
        bleu: color(PRIMARY_BLUE),
        vert: color(PRIMARY_BLUE),
      });
    }));

  it("une proposition en attente du même nom est remplacée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await callMcp(app, {
        token: accessToken,
        method: "tools/call",
        params: {
          name: "write_tokens",
          arguments: { projectId, tokens: [makeColorToken({ name: "bleu" })] },
        },
      });

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { bleu: color(NIGHT_BLUE) },
      });

      expect(response.status).toBe(201);
      expect(
        (await db.orm.select({ status: schema.proposal.status }).from(schema.proposal)).map(
          ({ status }) => status,
        ),
      ).toEqual(["replaced"]);
    }));

  it("chaque token importé laisse une entrée token.created avec le correlationId de la requête", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      await importTokens(app, {
        accessToken,
        projectId,
        document: { bleu: color(PRIMARY_BLUE), rouge: color(NIGHT_BLUE) },
      });

      const entries = await tokenCreations(app, { accessToken, projectId });
      expect(entries).toHaveLength(2);
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "token.created",
            after: expect.objectContaining({ name: "bleu" }),
            correlationId: IMPORT_CORRELATION_ID,
          }),
          expect.objectContaining({
            action: "token.created",
            after: expect.objectContaining({ name: "rouge" }),
            correlationId: IMPORT_CORRELATION_ID,
          }),
        ]),
      );
    }));

  it("un import refusé ne laisse aucune entrée d'historique", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      await importTokens(app, {
        accessToken,
        projectId,
        document: { bleu: color(PRIMARY_BLUE), marque: color("{rouge}") },
      });

      expect(await tokenCreations(app, { accessToken, projectId })).toEqual([]);
    }));

  it("500 tokens s'importent", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: documentOf(500),
      });

      expect(await response.json()).toEqual({ imported: 500, modes: [] });
    }));

  it("501 tokens répondent 400, sans rien écrire", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: documentOf(501),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([{ path: "tokens", message: "500 tokens au plus par import" }]),
      );
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({});
    }));
});

describe("un token sans $type prend celui de son groupe le plus proche (ADR 0041)", () => {
  it("un token sans $type prend le $type de son groupe", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { couleur: { $type: "color", bleu: { $value: PRIMARY_BLUE } } },
      });

      expect(response.status).toBe(201);
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({
        couleur: { bleu: color(PRIMARY_BLUE) },
      });
    }));

  it("le groupe le plus proche qui porte un $type l'emporte sur les groupes plus haut", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: {
          $type: "dimension",
          couleur: { $type: "color", fond: { bleu: { $value: PRIMARY_BLUE } } },
          espace: { moyen: { $value: SIXTEEN_PX } },
        },
      });

      expect(response.status).toBe(201);
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({
        couleur: { fond: { bleu: color(PRIMARY_BLUE) } },
        espace: { moyen: { $type: "dimension", $value: SIXTEEN_PX } },
      });
    }));

  it("le $type propre au token l'emporte sur celui de son groupe", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { espace: { $type: "color", moyen: { $type: "dimension", $value: SIXTEEN_PX } } },
      });

      expect(response.status).toBe(201);
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({
        espace: { moyen: { $type: "dimension", $value: SIXTEEN_PX } },
      });
    }));

  it("une valeur qui ne correspond pas au $type hérité répond 400 sur sa valeur", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { couleur: { $type: "color", bleu: { $value: 12 } } },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([{ path: "tokens.couleur.bleu.$value", message: expect.any(String) }]),
      );
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({});
    }));

  it("un $type de groupe invalide répond 400 une fois, sur le $type du groupe", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: {
          couleur: {
            $type: "colour",
            bleu: { $value: PRIMARY_BLUE },
            rouge: { $value: NIGHT_BLUE },
            nuit: color(NIGHT_BLUE),
          },
        },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([{ path: "tokens.couleur.$type", message: expect.any(String) }]),
      );
    }));

  it("un $type propre invalide, dans un groupe typé, répond 400 sur le $type du token", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { couleur: { $type: "color", bleu: { $type: "colour", $value: PRIMARY_BLUE } } },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([{ path: "tokens.couleur.bleu.$type", message: expect.any(String) }]),
      );
    }));

  it("deux erreurs différentes au même chemin restent toutes les deux", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { "bord.fin": color(PRIMARY_BLUE), bord: { fin: 1 } },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          { path: "tokens.bord.fin", message: "Point interdit dans un nom" },
          { path: "tokens.bord.fin", message: "Ni un token ni un groupe" },
        ]),
      );
    }));

  it("un $type invalide à la racine du document répond 400 sur tokens.$type", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { $type: "colour", bleu: { $value: PRIMARY_BLUE } },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([{ path: "tokens.$type", message: expect.any(String) }]),
      );
    }));

  it("un token sans $type, dans des groupes sans $type, répond 400 sur son $type", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { couleur: { bleu: { $value: PRIMARY_BLUE } } },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([{ path: "tokens.couleur.bleu.$type", message: "Type manquant" }]),
      );
    }));
});

describe("l'import refuse ce que dezyn ne stocke pas (ADR 0041)", () => {
  it.each([["$description"], ["$extensions"], ["$inconnu"]])(
    "%s posé sur un groupe répond 400 avec son chemin",
    (property) =>
      withIdentityApp(async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);

        const response = await importTokens(app, {
          accessToken,
          projectId,
          document: { couleur: { [property]: {}, bleu: color(PRIMARY_BLUE) } },
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject(
          invalidDocument([
            {
              path: `tokens.couleur.${property}`,
              message: "Propriété de groupe non prise en charge",
            },
          ]),
        );
        expect(await exportedDocument(app, { accessToken, projectId })).toEqual({});
      }),
  );

  it.each([
    [
      "un token",
      { couleur: { bleu: { ...color(PRIMARY_BLUE), $deprecated: true } } },
      "tokens.couleur.bleu.$deprecated",
    ],
    [
      "un groupe",
      { couleur: { $deprecated: true, bleu: color(PRIMARY_BLUE) } },
      "tokens.couleur.$deprecated",
    ],
  ])("$deprecated posé sur %s répond 400 avec son chemin", (_, document, path) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, { accessToken, projectId, document });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([{ path, message: "Propriété non prise en charge" }]),
      );
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({});
    }),
  );

  it("$root répond 400 avec son chemin", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { couleur: { $root: color(PRIMARY_BLUE), nuit: color(NIGHT_BLUE) } },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          { path: "tokens.couleur.$root", message: "Propriété non prise en charge" },
        ]),
      );
      expect(await exportedDocument(app, { accessToken, projectId })).toEqual({});
    }));

  it("toutes les propriétés refusées reviennent dans le même 400", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: {
          couleur: {
            $description: "Couleurs",
            $root: color(PRIMARY_BLUE),
            nuit: { ...color(NIGHT_BLUE), $deprecated: true },
          },
        },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          {
            path: "tokens.couleur.$description",
            message: "Propriété de groupe non prise en charge",
          },
          { path: "tokens.couleur.$root", message: "Propriété non prise en charge" },
          { path: "tokens.couleur.nuit.$deprecated", message: "Propriété non prise en charge" },
        ]),
      );
    }));

  it.each([
    ["un texte", "#ff0000"],
    ["null", null],
  ])("une valeur qui n'est ni un token ni un groupe (%s) répond 400 avec son chemin", (_, value) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { couleur: { bleu: color(PRIMARY_BLUE), rouge: value } },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([{ path: "tokens.couleur.rouge", message: "Ni un token ni un groupe" }]),
      );
    }),
  );

  it("un document Resolver dans un projet sans modes répond 400", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: resolverOf({ clair: {}, sombre: {} }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          { path: "modifiers", message: "Document Resolver dans un projet sans modes" },
        ]),
      );
    }));
});

const resolverOf = (
  contexts: Readonly<Record<string, object>>,
  { modifier = "apparence" }: { readonly modifier?: string } = {},
) => ({
  version: "2025.10",
  modifiers: {
    [modifier]: {
      contexts: Object.fromEntries(
        Object.entries(contexts).map(([mode, tokens]) => [mode, [tokens]]),
      ),
      default: Object.keys(contexts)[0],
    },
  },
  resolutionOrder: [{ $ref: `#/modifiers/${modifier}` }],
});

const seedModalProject = async (app: App, db: Parameters<typeof seedModes>[0]) => {
  const project = await seedProject(app, db);
  await seedModes(db, { projectId: project.projectId, modes: ["clair", "sombre"] });
  return project;
};

describe("un membre importe un document Resolver dans un projet qui a les mêmes modes (ADR 0041)", () => {
  it("un document exporté d'un projet à modes, importé dans un projet aux mêmes modes, ressort identique", () =>
    withIdentityApp(async (app, db) => {
      const source = await seedModalProject(app, db);
      const $extensions = { "com.figma": { italic: true } };
      await addToken(app, {
        ...source,
        token: {
          name: "couleur.fond",
          $type: "color",
          modes: { clair: PRIMARY_BLUE, sombre: NIGHT_BLUE },
          $description: "Fond de page",
          $extensions,
        },
      });
      await addToken(app, {
        ...source,
        token: {
          name: "couleur.texte",
          $type: "color",
          modes: { clair: NIGHT_BLUE, sombre: "{couleur.fond}" },
        },
      });
      const exported = await exportedDocument(app, source);
      const target = await seedProjectAsEditor(app, db, { user: GRACE });
      await seedModes(db, { projectId: target.projectId, modes: ["clair", "sombre"] });

      const response = await importTokens(app, { ...target, document: exported });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ imported: 2, modes: ["clair", "sombre"] });
      expect(await exportedDocument(app, target)).toEqual(exported);
    }));

  it("des contextes dans un autre ordre que les modes s'importent, et l'ordre du projet fait foi", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await seedModes(db, { projectId, modes: ["sombre", "clair"] });

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: resolverOf({
          clair: { fond: color(PRIMARY_BLUE) },
          sombre: { fond: color(NIGHT_BLUE) },
        }),
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ imported: 1, modes: ["sombre", "clair"] });
      expect(
        Object.keys(
          (await exportedDocument(app, { accessToken, projectId })).modifiers.apparence.contexts,
        ),
      ).toEqual(["sombre", "clair"]);
    }));

  it("dans chaque contexte, un token hérite le $type de son groupe et référence un token du projet", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedModalProject(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: { name: "base", $type: "color", modes: { clair: PRIMARY_BLUE, sombre: NIGHT_BLUE } },
      });
      const context = { couleur: { $type: "color", texte: { $value: "{base}" } } };

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: resolverOf({ clair: context, sombre: context }),
      });

      expect(response.status).toBe(201);
      expect(
        (await exportedDocument(app, { accessToken, projectId })).modifiers.apparence.contexts
          .sombre,
      ).toEqual([{ base: color(NIGHT_BLUE), couleur: { texte: color("{base}") } }]);
    }));

  it("un token absent d'un contexte répond 400 sur ce mode, sans rien écrire", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedModalProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: resolverOf({
          clair: { fond: color(PRIMARY_BLUE), texte: color(NIGHT_BLUE) },
          sombre: { fond: color(NIGHT_BLUE) },
        }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          { path: "tokens.texte.modes.sombre", message: "Valeur manquante pour ce mode" },
        ]),
      );
      expect(await tokenCreations(app, { accessToken, projectId })).toEqual([]);
    }));

  it.each([
    ["$description", "Fond", "Fond sombre"],
    ["$extensions", { "com.figma": { italic: true } }, { "com.figma": { italic: false } }],
  ])(
    "%s différent d'un contexte à l'autre répond 400 sur cette propriété",
    (property, clair, sombre) =>
      withIdentityApp(async (app, db) => {
        const { accessToken, projectId } = await seedModalProject(app, db);

        const response = await importTokens(app, {
          accessToken,
          projectId,
          document: resolverOf({
            clair: { fond: { ...color(PRIMARY_BLUE), [property]: clair } },
            sombre: { fond: { ...color(NIGHT_BLUE), [property]: sombre } },
          }),
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject(
          invalidDocument([
            { path: `tokens.fond.${property}`, message: "Propriété différente selon le mode" },
          ]),
        );
      }),
  );

  it("une propriété présente dans un seul contexte répond 400 sur cette propriété", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedModalProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: resolverOf({
          clair: { fond: { ...color(PRIMARY_BLUE), $description: "Fond" } },
          sombre: { fond: color(NIGHT_BLUE) },
        }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          { path: "tokens.fond.$description", message: "Propriété différente selon le mode" },
        ]),
      );
    }));

  it("un $type différent d'un contexte à l'autre répond 400 sur le $type", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedModalProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: resolverOf({
          clair: { fond: color(PRIMARY_BLUE) },
          sombre: { fond: { $type: "dimension", $value: SIXTEEN_PX } },
        }),
      });

      expect(response.status).toBe(400);
      expect((await response.json()).errors).toContainEqual({
        path: "tokens.fond.$type",
        message: "Propriété différente selon le mode",
      });
    }));

  it("une référence cassée dans un contexte répond 400 sur ce mode", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedModalProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: resolverOf({
          clair: { fond: color(PRIMARY_BLUE) },
          sombre: { fond: color("{inconnu}") },
        }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          { path: "tokens.fond.modes.sombre", message: "Référence vers un token inexistant" },
        ]),
      );
    }));

  it("une erreur répétée d'un contexte à l'autre n'apparaît qu'une fois, les autres restent", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedModalProject(app, db);
      const context = {
        couleur: { $description: "Couleurs", fond: color(PRIMARY_BLUE) },
        espace: { $description: "Espaces" },
        "bord.fin": color(PRIMARY_BLUE),
        bord: { fin: 1 },
      };

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: resolverOf({ clair: context, sombre: context }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          {
            path: "tokens.couleur.$description",
            message: "Propriété de groupe non prise en charge",
          },
          {
            path: "tokens.espace.$description",
            message: "Propriété de groupe non prise en charge",
          },
          { path: "tokens.bord.fin", message: "Point interdit dans un nom" },
          { path: "tokens.bord.fin", message: "Ni un token ni un groupe" },
        ]),
      );
    }));

  it("un nom déjà validé répond 409, et un import réussi laisse une entrée token.created par token", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedModalProject(app, db);
      const document = resolverOf({
        clair: { fond: color(PRIMARY_BLUE), texte: color(NIGHT_BLUE) },
        sombre: { fond: color(NIGHT_BLUE), texte: color(PRIMARY_BLUE) },
      });

      const first = await importTokens(app, { accessToken, projectId, document });
      const second = await importTokens(app, { accessToken, projectId, document });

      expect(first.status).toBe(201);
      expect(await tokenCreations(app, { accessToken, projectId })).toHaveLength(2);
      expect(second.status).toBe(409);
    }));

  it("500 tokens présents dans deux contextes s'importent : la limite compte les tokens", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedModalProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: resolverOf({ clair: documentOf(500), sombre: documentOf(500) }),
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ imported: 500, modes: ["clair", "sombre"] });
    }));

  it("501 tokens répondent 400", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedModalProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: resolverOf({ clair: documentOf(501), sombre: documentOf(501) }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([{ path: "tokens", message: "500 tokens au plus par import" }]),
      );
    }));
});

const VALID_RESOLVER = resolverOf({ clair: {}, sombre: {} });

describe("l'import refuse un document Resolver qui ne correspond pas au projet (ADR 0041)", () => {
  it.each([
    ["un autre modificateur", resolverOf({ clair: {}, sombre: {} }, { modifier: "theme" })],
    ["un mode en moins", resolverOf({ clair: {} })],
    ["un mode en plus", resolverOf({ clair: {}, sombre: {}, contraste: {} })],
    ["un mode remplacé", resolverOf({ clair: {}, contraste: {} })],
    ["aucun contexte", { ...VALID_RESOLVER, modifiers: { apparence: {} } }],
  ])("%s répond 400 sur modifiers", (_, document) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedModalProject(app, db);

      const response = await importTokens(app, { accessToken, projectId, document });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([{ path: "modifiers", message: "Modes différents de ceux du projet" }]),
      );
    }),
  );

  const VALID = VALID_RESOLVER;
  const APPARENCE = VALID.modifiers.apparence;

  it.each([
    ["une autre version", { ...VALID, version: "2024.1" }, "version", "Version 2025.10 attendue"],
    ["des sets", { ...VALID, sets: {} }, "sets", "Ensembles non pris en charge"],
    [
      "un document sans version",
      { modifiers: VALID.modifiers, resolutionOrder: VALID.resolutionOrder },
      "version",
      "Version 2025.10 attendue",
    ],
    [
      "un document sans resolutionOrder",
      { version: VALID.version, modifiers: VALID.modifiers },
      "resolutionOrder",
      "Le seul modificateur du document attendu",
    ],
    [
      "un resolutionOrder qui n'est pas une liste",
      { ...VALID, resolutionOrder: { $ref: "#/modifiers/apparence" } },
      "resolutionOrder",
      "Le seul modificateur du document attendu",
    ],
    [
      "aucun modificateur",
      { ...VALID, modifiers: {} },
      "modifiers",
      "Un seul modificateur attendu",
    ],
    [
      "des modificateurs en liste",
      { ...VALID, modifiers: [APPARENCE] },
      "modifiers",
      "Un seul modificateur attendu",
    ],
    [
      "un contexte qui n'est pas une liste",
      {
        ...VALID,
        modifiers: { apparence: { ...APPARENCE, contexts: { clair: {}, sombre: [{}] } } },
      },
      "modifiers.apparence.contexts.clair",
      "Une seule source en ligne attendue",
    ],
    [
      "deux modificateurs",
      { ...VALID, modifiers: { apparence: APPARENCE, densite: APPARENCE } },
      "modifiers",
      "Un seul modificateur attendu",
    ],
    [
      "un contexte à deux sources",
      {
        ...VALID,
        modifiers: { apparence: { ...APPARENCE, contexts: { clair: [{}, {}], sombre: [{}] } } },
      },
      "modifiers.apparence.contexts.clair",
      "Une seule source en ligne attendue",
    ],
    [
      "un contexte sans source",
      {
        ...VALID,
        modifiers: { apparence: { ...APPARENCE, contexts: { clair: [], sombre: [{}] } } },
      },
      "modifiers.apparence.contexts.clair",
      "Une seule source en ligne attendue",
    ],
    [
      "une source en $ref",
      {
        ...VALID,
        modifiers: {
          apparence: { ...APPARENCE, contexts: { clair: [{ $ref: "clair.json" }], sombre: [{}] } },
        },
      },
      "modifiers.apparence.contexts.clair",
      "Une seule source en ligne attendue",
    ],
    [
      "un resolutionOrder qui ne vise pas le modificateur",
      { ...VALID, resolutionOrder: [{ $ref: "#/modifiers/theme" }] },
      "resolutionOrder",
      "Le seul modificateur du document attendu",
    ],
    [
      "un resolutionOrder à deux entrées",
      { ...VALID, resolutionOrder: [...VALID.resolutionOrder, ...VALID.resolutionOrder] },
      "resolutionOrder",
      "Le seul modificateur du document attendu",
    ],
    [
      "un default qui ne nomme aucun contexte",
      { ...VALID, modifiers: { apparence: { ...APPARENCE, default: "contraste" } } },
      "modifiers.apparence.default",
      "Contexte inconnu",
    ],
  ])("%s répond 400 avec son chemin", (_, document, path, message) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedModalProject(app, db);

      const response = await importTokens(app, { accessToken, projectId, document });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(invalidDocument([{ path, message }]));
    }),
  );
});

describe("seul un membre du projet importe des tokens", () => {
  it("un non-membre reçoit 404, sans rien écrire", () =>
    withIdentityApp(async (app, db) => {
      const owner = await seedProject(app, db);
      const grace = await obtainAccessToken(app, { user: GRACE });

      const response = await importTokens(app, {
        accessToken: grace.accessToken,
        projectId: owner.projectId,
        document: { bleu: color(PRIMARY_BLUE) },
      });

      expect(response.status).toBe(404);
      expect(await exportedDocument(app, owner)).toEqual({});
    }));

  it.each([[randomUUID()], ["pas-un-uuid"]])("le projet %s, inconnu, répond 404", (projectId) =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { bleu: color(PRIMARY_BLUE) },
      });

      expect(response.status).toBe(404);
    }),
  );
});
