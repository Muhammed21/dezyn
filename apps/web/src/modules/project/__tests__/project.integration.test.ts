import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  makeClientIp,
  signUp,
  withIdentityApp,
} from "@repo/api/testing/authorization-flow.ts";
import { personalSpaceOf, seedTeamSpaceWith } from "@repo/api/testing/space-fixtures.ts";
import { err } from "@repo/result";

import { makeApiBrowser } from "../../../testing/api-browser.ts";
import { createProjects } from "../project-module.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNKNOWN_SPACE_ID = "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e";

const signedInAda = async (app: App) => {
  const ip = makeClientIp();
  const userId = await signUp(app, ip);
  const fetch = makeApiBrowser(app, { ip });
  await fetch(`${BASE_URL}/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADA.email, password: ADA.password }),
  });
  return { userId, fetch, projects: createProjects({ apiUrl: BASE_URL, fetch }) };
};

const listedProjectsOf = async (
  fetch: ReturnType<typeof makeApiBrowser>,
  spaceId: string,
): Promise<unknown> => {
  const listed = await fetch(`${BASE_URL}/v1/spaces/${spaceId}/projects`, { method: "GET" });
  const body: unknown = await listed.json();
  return body;
};

describe("création d'un projet par l'app web, contre la vraie API (ADR 0044 §2 et §6)", () => {
  it("un propriétaire connecté crée un projet dans son espace", () =>
    withIdentityApp(async (app, db) => {
      const { userId, fetch, projects } = await signedInAda(app);
      const spaceId = await personalSpaceOf(db, userId);

      const created = await projects.createProject({ spaceId, name: "  Site vitrine  " });

      expect(created).toEqual({
        ok: true,
        value: {
          id: expect.stringMatching(UUID),
          spaceId,
          name: "Site vitrine",
          createdAt: expect.any(Date),
        },
      });
      expect(await listedProjectsOf(fetch, spaceId)).toMatchObject({
        projects: [{ name: "Site vitrine" }],
      });
    }));

  it("un espace Free à 3 projets donne plan_required avec la limite", () =>
    withIdentityApp(async (app, db) => {
      const { userId, projects } = await signedInAda(app);
      const spaceId = await personalSpaceOf(db, userId);
      for (const name of ["Un", "Deux", "Trois"]) {
        await projects.createProject({ spaceId, name });
      }

      expect(await projects.createProject({ spaceId, name: "Quatre" })).toEqual(
        err({ reason: "plan_required", limit: 3 }),
      );
    }));

  it("sans session, la création donne unauthenticated", () =>
    withIdentityApp(async (app, db) => {
      const { userId } = await signedInAda(app);
      const spaceId = await personalSpaceOf(db, userId);
      const anonymous = createProjects({
        apiUrl: BASE_URL,
        fetch: makeApiBrowser(app, { ip: makeClientIp() }),
      });

      expect(await anonymous.createProject({ spaceId, name: "Site vitrine" })).toEqual(
        err("unauthenticated"),
      );
    }));

  it("un espace inconnu donne not_found", () =>
    withIdentityApp(async (app) => {
      const { projects } = await signedInAda(app);

      expect(
        await projects.createProject({ spaceId: UNKNOWN_SPACE_ID, name: "Site vitrine" }),
      ).toEqual(err("not_found"));
    }));

  it("un éditeur d'un espace Team donne forbidden", () =>
    withIdentityApp(async (app, db) => {
      const { userId, projects } = await signedInAda(app);
      const spaceId = await seedTeamSpaceWith(db, { userId, role: "editor" });

      expect(await projects.createProject({ spaceId, name: "Site vitrine" })).toEqual(
        err("forbidden"),
      );
    }));
});
