import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { schema } from "@repo/db";

import type { PostgresDatabase } from "../../platform/postgres-database.ts";
import { type App, withIdentityApp } from "../../testing/authorization-flow.ts";
import { seedModes, seedProject } from "../../testing/project-fixtures.ts";
import { addToken, historyOf, makeColorToken, PRIMARY_BLUE } from "../../testing/token-fixtures.ts";

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const makeModalToken = (modes: Record<string, unknown>) => ({
  name: "couleur.fond.primaire",
  $type: "color",
  modes,
});

const seedLightAndDarkProject = async (app: App, db: PostgresDatabase) => {
  const project = await seedProject(app, db);
  await seedModes(db, { projectId: project.projectId, modes: ["clair", "sombre"] });
  return project;
};

describe("un membre donne une valeur au token dans chaque mode du projet (ADR 0010 §4)", () => {
  it("sur un projet clair et sombre, un ajout avec les deux valeurs est Validé", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedLightAndDarkProject(app, db);
      const token = makeModalToken({ clair: PRIMARY_BLUE, sombre: NIGHT_BLUE });

      const response = await addToken(app, { accessToken, projectId, token });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ ...token, status: "validated" });
      expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
        action: "token.created",
        after: token,
      });
    }));
});

describe("un ajout qui ne suit pas les modes du projet répond 400, en nommant le mode", () => {
  it.each([
    [
      "un mode oublié",
      makeModalToken({ clair: PRIMARY_BLUE }),
      { path: "modes.sombre", message: "Valeur manquante pour ce mode" },
    ],
    [
      "un mode inconnu du projet",
      makeModalToken({ clair: PRIMARY_BLUE, sombre: NIGHT_BLUE, nuit: NIGHT_BLUE }),
      { path: "modes.nuit", message: "Mode inconnu du projet" },
    ],
    [
      "une valeur unique",
      makeColorToken(),
      {
        path: "$value",
        message: "Le projet a des modes : donner une valeur par mode dans modes",
      },
    ],
    [
      "une valeur invalide dans un mode",
      makeModalToken({
        clair: PRIMARY_BLUE,
        sombre: { ...NIGHT_BLUE, components: [0.1, 0.2, 1.4] },
      }),
      { path: "modes.sombre.components", message: "Composante hors de l'intervalle 0 à 1" },
    ],
  ])("%s", (_case, token, error) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedLightAndDarkProject(app, db);

      const response = await addToken(app, { accessToken, projectId, token });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Requête invalide",
        errors: [error],
      });
    }),
  );

  it("un mode oublié n'écrit ni token ni entrée d'historique", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedLightAndDarkProject(app, db);

      await addToken(app, {
        accessToken,
        projectId,
        token: makeModalToken({ clair: PRIMARY_BLUE }),
      });

      expect(
        (await historyOf(app, { accessToken, projectId })).map(
          (entry: { action: string }) => entry.action,
        ),
      ).toEqual(["project.created"]);
    }));
});

describe("un projet sans modificateur accepte une seule valeur", () => {
  it("des valeurs par mode répondent 400 sur modes", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeModalToken({ clair: PRIMARY_BLUE }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        errors: [{ path: "modes", message: "Le projet n'a pas de modes : donner $value" }],
      });
    }));

  it("une valeur absente répond 400 sur $value", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ $value: undefined }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        errors: [{ path: "$value", message: "Valeur manquante" }],
      });
    }));
});

describe("un projet a un seul modificateur, tant que les modes ne disent pas le leur", () => {
  it("la base refuse un second modificateur dans le même projet", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await seedLightAndDarkProject(app, db);

      await expect(
        db.orm.insert(schema.modifier).values({ id: randomUUID(), projectId, name: "contraste" }),
      ).rejects.toMatchObject({ cause: { constraint: "modifier_project_id_key" } });
      expect(await db.orm.select({ name: schema.modifier.name }).from(schema.modifier)).toEqual([
        { name: "apparence" },
      ]);
    }));
});
