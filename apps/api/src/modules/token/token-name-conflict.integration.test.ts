import { describe, expect, it } from "vitest";

import { withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { addToken, makeColorToken, seedProposedToken } from "#testing/token-fixtures.ts";
import { schema } from "@repo/db";

const conflictWith = (other: string) => ({
  type: "about:blank",
  title: "Requête invalide",
  status: 400,
  errors: [{ path: "name", message: `Nom en conflit de groupe avec le token ${other}` }],
});

describe("un membre n'ajoute pas un token dont le nom est le groupe d'un autre (ADR 0039 §1)", () => {
  it("un nom qui est le groupe d'un token validé répond 400 en le nommant, sans token créé", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.fond" }),
      });

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur" }),
      });

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toMatchObject(conflictWith("couleur.fond"));
      expect(await db.orm.select({ name: schema.token.name }).from(schema.token)).toEqual([
        { name: "couleur.fond" },
      ]);
    }));

  it("un nom dont un groupe est un token validé répond 400 en le nommant", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, { accessToken, projectId, token: makeColorToken({ name: "couleur" }) });

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.fond.primaire" }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(conflictWith("couleur"));
    }));

  it("une proposition en attente compte aussi, et reste en attente", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await seedProposedToken(db, { projectId, name: "couleur.fond" });

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur" }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(conflictWith("couleur.fond"));
      expect(
        await db.orm
          .select({ name: schema.token.name, status: schema.token.status })
          .from(schema.token),
      ).toEqual([{ name: "couleur.fond", status: "proposed" }]);
    }));

  it("un nom qui commence comme un segment d'un autre token est accepté", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.fond" }),
      });

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.fondu" }),
      });

      expect(response.status).toBe(201);
    }));
});
