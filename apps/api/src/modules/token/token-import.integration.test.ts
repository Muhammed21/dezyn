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
import { seedProject, seedProjectAsEditor } from "#testing/project-fixtures.ts";
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

describe("l'import refuse ce qu'il ne prend pas encore en charge (ADR 0041)", () => {
  it("un token sans $type répond 400 sur son $type", () =>
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

  it("une propriété posée sur un groupe répond 400 avec son chemin", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await importTokens(app, {
        accessToken,
        projectId,
        document: { couleur: { $description: "Couleurs", bleu: color(PRIMARY_BLUE) } },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(
        invalidDocument([
          {
            path: "tokens.couleur.$description",
            message: "Propriété de groupe non prise en charge",
          },
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

  it.each([["version"], ["resolutionOrder"]])(
    "un document Resolver, reconnu à son champ %s, répond 400",
    (field) =>
      withIdentityApp(async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);

        const response = await importTokens(app, {
          accessToken,
          projectId,
          document: { [field]: field === "version" ? "2025.10" : [] },
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject(
          invalidDocument([{ path: field, message: "Document Resolver non pris en charge" }]),
        );
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
