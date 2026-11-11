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
import { personalSpaceOf, seedTeamSpaceWith } from "@repo/api/testing/space-fixtures.ts";
import { err, ok } from "@repo/result";

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
  return { userId, projects: createProjects({ apiUrl: BASE_URL, fetch }) };
};

describe("création d'un projet par l'app web, contre la vraie API (ADR 0044 §2 et §6)", () => {
  it("un propriétaire connecté crée un projet dans son espace", () =>
    withIdentityApp(async (app, db) => {
      const { userId, projects } = await signedInAda(app);
      const spaceId = await personalSpaceOf(db, userId);

      const created = await projects.createProject({ spaceId, name: "  Site vitrine  " });

      expect(created).toEqual(
        ok({
          id: expect.stringMatching(UUID),
          spaceId,
          name: "Site vitrine",
          createdAt: expect.any(Date),
        }),
      );
      const listed = await projects.listProjects({ spaceId });
      expect(listed.ok && listed.value.map(({ name }) => name)).toEqual(["Site vitrine"]);
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

describe("liste des projets d'un espace par l'app web, contre la vraie API (ADR 0044 §6)", () => {
  it("un membre retrouve les projets qu'il vient de créer, par ordre de nom, sans purge", () =>
    withIdentityApp(async (app, db) => {
      const { userId, projects } = await signedInAda(app);
      const spaceId = await personalSpaceOf(db, userId);
      await projects.createProject({ spaceId, name: "Site vitrine" });
      await projects.createProject({ spaceId, name: "Application" });

      const listed = await projects.listProjects({ spaceId });

      expect(listed).toEqual(
        ok([
          {
            id: expect.stringMatching(UUID),
            spaceId,
            name: "Application",
            createdAt: expect.any(Date),
            historyPurgedAt: undefined,
          },
          {
            id: expect.stringMatching(UUID),
            spaceId,
            name: "Site vitrine",
            createdAt: expect.any(Date),
            historyPurgedAt: undefined,
          },
        ]),
      );
    }));

  it("un espace sans projet donne une liste vide", () =>
    withIdentityApp(async (app, db) => {
      const { userId, projects } = await signedInAda(app);
      const spaceId = await personalSpaceOf(db, userId);

      expect(await projects.listProjects({ spaceId })).toEqual(ok([]));
    }));

  it("l'espace personnel d'un autre membre donne not_found", () =>
    withIdentityApp(async (app, db) => {
      const { projects } = await signedInAda(app);
      const graceId = await signUp(app, makeClientIp(), GRACE);
      const graceSpaceId = await personalSpaceOf(db, graceId);

      expect(await projects.listProjects({ spaceId: graceSpaceId })).toEqual(err("not_found"));
    }));

  it("sans session, la liste donne unauthenticated", () =>
    withIdentityApp(async (app, db) => {
      const { userId } = await signedInAda(app);
      const spaceId = await personalSpaceOf(db, userId);
      const anonymous = createProjects({
        apiUrl: BASE_URL,
        fetch: makeApiBrowser(app, { ip: makeClientIp() }),
      });

      expect(await anonymous.listProjects({ spaceId })).toEqual(err("unauthenticated"));
    }));
});
