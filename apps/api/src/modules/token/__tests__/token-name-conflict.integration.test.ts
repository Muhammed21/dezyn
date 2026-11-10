import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { addToken, makeColorToken } from "#testing/token-fixtures.ts";
import { schema } from "@repo/db";

const proposeTokens = (
  app: App,
  { accessToken, projectId, tokens }: { accessToken: string; projectId: string; tokens: object[] },
) =>
  callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name: "write_tokens", arguments: { projectId, tokens } },
  });

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
      await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.fond" })],
      });

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur" }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(conflictWith("couleur.fond"));
      expect(await db.orm.select().from(schema.token)).toEqual([]);
      expect(
        await db.orm
          .select({ tokenName: schema.proposal.tokenName, status: schema.proposal.status })
          .from(schema.proposal),
      ).toEqual([{ tokenName: "couleur.fond", status: "proposed" }]);
    }));

  it("une proposition en attente d'un autre projet ne compte pas", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, spaceId, projectId } = await seedProject(app, db);
      const created = await app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ name: "Application" }),
      });
      const other = String((await created.json()).id);
      await proposeTokens(app, {
        accessToken,
        projectId: other,
        tokens: [makeColorToken({ name: "couleur.fond" })],
      });

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur" }),
      });

      expect(response.status).toBe(201);
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
