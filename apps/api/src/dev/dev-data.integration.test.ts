import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { composeModules } from "#compose-modules";
import {
  type App,
  BASE_URL,
  makeClientIp,
  obtainAccessToken,
  WEB_URL,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { schema } from "@repo/db";
import { ok } from "@repo/result";

import { resetDevData, seedDevData } from "./dev-data.ts";

const makeDevUser = () => ({
  name: "Muhammed",
  email: "muhammed@dezyn.test",
  password: "un-mot-de-passe-de-dev",
});

const getJson = async (app: App, { accessToken, path }: { accessToken: string; path: string }) => {
  const response = await app.request(`${BASE_URL}/v1${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return { status: response.status, body: await response.json() };
};

describe("le seed de dev crée un utilisateur prêt à se connecter, avec un espace d'équipe et un projet", () => {
  it("l'utilisateur se connecte et retrouve son espace personnel, son espace d'équipe et son projet", () =>
    withIdentityApp(async (app, db) => {
      const user = makeDevUser();
      const { projects } = composeModules({
        db,
        mailer: { send: async () => ok(undefined) },
        webUrl: WEB_URL,
      });

      const seeded = await seedDevData({
        app,
        db,
        createProject: projects.createProject,
        user,
        baseURL: BASE_URL,
        clientIp: makeClientIp(),
      });
      if (!seeded.ok) {
        throw new Error(`seed refusé : ${seeded.error}`);
      }
      const { accessToken } = await obtainAccessToken(app, {
        user,
        registeredId: seeded.value.userId,
      });
      const spaces = await getJson(app, { accessToken, path: "/spaces" });
      const tokens = await getJson(app, {
        accessToken,
        path: `/projects/${seeded.value.projectId}/tokens`,
      });

      expect(spaces.body.spaces).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ plan: "free", role: "owner" }),
          { id: seeded.value.spaceId, name: "Studio Muhammed", plan: "team", role: "owner" },
        ]),
      );
      expect(tokens).toEqual({ status: 200, body: { modes: [], tokens: [] } });
    }));

  it("une inscription refusée par better-auth fait échouer le seed avec sa raison", () =>
    withIdentityApp(async (app, db) => {
      const { projects } = composeModules({
        db,
        mailer: { send: async () => ok(undefined) },
        webUrl: WEB_URL,
      });

      const seeded = seedDevData({
        app,
        db,
        createProject: projects.createProject,
        user: { ...makeDevUser(), password: "court" },
        baseURL: BASE_URL,
        clientIp: makeClientIp(),
      });

      await expect(seeded).rejects.toThrow(/^Inscription refusée \(400\) : .*Password too short/);
    }));

  it("relancer le seed avec le même email ne crée rien de plus", () =>
    withIdentityApp(async (app, db) => {
      const user = makeDevUser();
      const { projects } = composeModules({
        db,
        mailer: { send: async () => ok(undefined) },
        webUrl: WEB_URL,
      });
      await seedDevData({
        app,
        db,
        createProject: projects.createProject,
        user,
        baseURL: BASE_URL,
        clientIp: makeClientIp(),
      });

      const again = await seedDevData({
        app,
        db,
        createProject: projects.createProject,
        user,
        baseURL: BASE_URL,
        clientIp: makeClientIp(),
      });
      const spaces = await db.orm.select().from(schema.space);
      const projectsInDb = await db.orm.select().from(schema.project);

      expect(again).toEqual({ ok: false, error: "user_exists" });
      expect(spaces).toHaveLength(2);
      expect(projectsInDb).toHaveLength(1);
    }));
});

describe("le vidage de dev supprime les utilisateurs et tout ce qui leur est lié", () => {
  it("après le vidage, plus d'utilisateur, d'espace ni de projet, et le seed refonctionne", () =>
    withIdentityApp(async (app, db, { migratorUrl }) => {
      const user = makeDevUser();
      const { projects } = composeModules({
        db,
        mailer: { send: async () => ok(undefined) },
        webUrl: WEB_URL,
      });
      await seedDevData({
        app,
        db,
        createProject: projects.createProject,
        user,
        baseURL: BASE_URL,
        clientIp: makeClientIp(),
      });

      await resetDevData({ migratorUrl });
      const left = {
        users: await db.orm.select().from(schema.identityUser),
        spaces: await db.orm.select().from(schema.space),
        projects: await db.orm.select().from(schema.project),
      };
      const reseeded = await seedDevData({
        app,
        db,
        createProject: projects.createProject,
        user,
        baseURL: BASE_URL,
        clientIp: makeClientIp(),
      });

      expect(left).toEqual({ users: [], spaces: [], projects: [] });
      expect(reseeded.ok).toBe(true);
    }));

  it("garde les clients OAuth enregistrés, pour que l'IA se reconnecte avec le même client_id", () =>
    withIdentityApp(async (app, db, { migratorUrl }) => {
      const { clientId } = await obtainAccessToken(app);

      await resetDevData({ migratorUrl });
      const clients = await db.orm
        .select({ clientId: schema.identityOAuthClient.clientId })
        .from(schema.identityOAuthClient);
      const accessTokens = await db.orm.select().from(schema.identityOAuthAccessToken);

      expect(clients).toEqual([{ clientId }]);
      expect(accessTokens).toEqual([]);
    }));

  it("supprime les clients OAuth qui appartiennent à un utilisateur", () =>
    withIdentityApp(async (app, db, { migratorUrl }) => {
      const { clientId, userId } = await obtainAccessToken(app);
      await db.orm.insert(schema.identityOAuthClient).values({
        id: randomUUID(),
        clientId: "client-d-un-utilisateur",
        userId,
        redirectUris: ["http://127.0.0.1:4000/callback"],
      });

      await resetDevData({ migratorUrl });
      const clients = await db.orm
        .select({ clientId: schema.identityOAuthClient.clientId })
        .from(schema.identityOAuthClient);

      expect(clients).toEqual([{ clientId }]);
    }));

  it("vide aussi une base locale adressée par localhost", () =>
    withIdentityApp(async (app, db, { migratorUrl }) => {
      const { projects } = composeModules({
        db,
        mailer: { send: async () => ok(undefined) },
        webUrl: WEB_URL,
      });
      await seedDevData({
        app,
        db,
        createProject: projects.createProject,
        user: makeDevUser(),
        baseURL: BASE_URL,
        clientIp: makeClientIp(),
      });
      const viaLocalhost = new URL(migratorUrl);
      viaLocalhost.hostname = "localhost";

      await resetDevData({ migratorUrl: viaLocalhost.toString() });

      expect(await db.orm.select().from(schema.identityUser)).toEqual([]);
    }));

  it("refuse de vider une base qui n'est pas locale", async () => {
    await expect(
      resetDevData({ migratorUrl: "postgresql://migrator:secret@db.example.com:5432/dezyn" }),
    ).rejects.toThrow("Vidage refusé : db.example.com n'est pas une base locale");
  });
});
