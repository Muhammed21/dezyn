import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  GRACE,
  makeClientIp,
  signUp,
  withIdentityApp,
} from "@repo/api/testing/authorization-flow.ts";
import { seedModes } from "@repo/api/testing/project-fixtures.ts";
import { personalSpaceOf } from "@repo/api/testing/space-fixtures.ts";
import { PRIMARY_BLUE } from "@repo/api/testing/token-fixtures.ts";
import { CreatedProjectOutput } from "@repo/contracts";
import { err, ok } from "@repo/result";

import { makeApiBrowser } from "../../../testing/api-browser.ts";
import { createTokens } from "../token-module.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNKNOWN_PROJECT_ID = "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e";
const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

type Database = Parameters<typeof personalSpaceOf>[0];

const projectOf = async (app: App, db: Database, user: typeof ADA = ADA) => {
  const ip = makeClientIp();
  const userId = await signUp(app, ip, user);
  const fetch = makeApiBrowser(app, { ip });
  await fetch(`${BASE_URL}/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const spaceId = await personalSpaceOf(db, userId);
  const created = await fetch(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Site vitrine" }),
  });
  const { id: projectId } = CreatedProjectOutput.parse(await created.json());
  const addToken = (token: object) =>
    fetch(`${BASE_URL}/v1/projects/${projectId}/tokens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(token),
    });
  return {
    projectId,
    addToken,
    tokens: createTokens({ apiUrl: BASE_URL, fetch }),
  };
};

describe("lecture des tokens d'un projet par l'app web, contre la vraie API (ADR 0044 §6)", () => {
  it("un membre lit le token d'un projet sans mode, avec sa valeur et sa description", () =>
    withIdentityApp(async (app, db) => {
      const { projectId, addToken, tokens } = await projectOf(app, db);
      await addToken({
        name: "couleur.fond.primaire",
        $type: "color",
        $value: PRIMARY_BLUE,
        $description: "Fond des boutons",
      });

      expect(await tokens.readTokens({ projectId })).toEqual(
        ok({
          modes: [],
          tokens: [
            {
              id: expect.stringMatching(UUID),
              name: "couleur.fond.primaire",
              type: "color",
              value: { kind: "single", value: PRIMARY_BLUE },
              description: "Fond des boutons",
            },
          ],
        }),
      );
    }));

  it("un membre lit les modes du projet et la valeur du token dans chaque mode", () =>
    withIdentityApp(async (app, db) => {
      const { projectId, addToken, tokens } = await projectOf(app, db);
      await seedModes(db, { projectId, modes: ["clair", "sombre"] });
      await addToken({
        name: "couleur.fond.primaire",
        $type: "color",
        modes: { clair: PRIMARY_BLUE, sombre: NIGHT_BLUE },
      });

      expect(await tokens.readTokens({ projectId })).toEqual(
        ok({
          modes: ["clair", "sombre"],
          tokens: [
            {
              id: expect.stringMatching(UUID),
              name: "couleur.fond.primaire",
              type: "color",
              value: { kind: "by_mode", values: { clair: PRIMARY_BLUE, sombre: NIGHT_BLUE } },
              description: undefined,
            },
          ],
        }),
      );
    }));

  it("un projet sans token donne une liste vide", () =>
    withIdentityApp(async (app, db) => {
      const { projectId, tokens } = await projectOf(app, db);

      expect(await tokens.readTokens({ projectId })).toEqual(ok({ modes: [], tokens: [] }));
    }));

  it("un projet inconnu donne not_found", () =>
    withIdentityApp(async (app, db) => {
      const { tokens } = await projectOf(app, db);

      expect(await tokens.readTokens({ projectId: UNKNOWN_PROJECT_ID })).toEqual(err("not_found"));
    }));

  it("le projet d'un autre membre donne not_found", () =>
    withIdentityApp(async (app, db) => {
      const { tokens } = await projectOf(app, db);
      const grace = await projectOf(app, db, GRACE);

      expect(await tokens.readTokens({ projectId: grace.projectId })).toEqual(err("not_found"));
    }));

  it("sans session, la lecture donne unauthenticated", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await projectOf(app, db);
      const anonymous = createTokens({
        apiUrl: BASE_URL,
        fetch: makeApiBrowser(app, { ip: makeClientIp() }),
      });

      expect(await anonymous.readTokens({ projectId })).toEqual(err("unauthenticated"));
    }));
});
