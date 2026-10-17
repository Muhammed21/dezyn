import { describe, expect, it } from "vitest";

import { migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { createApp } from "../../create-app.ts";
import type { LogRecord } from "../../platform/logging.ts";
import { createPostgresDatabase } from "../../platform/postgres-database.ts";
import { createIdentityAuth } from "./infrastructure/better-auth.ts";

const BASE_URL = "http://127.0.0.1:3000";
const SECRET = "secret-de-test-de-32-caracteres-au-moins";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const withIdentityApp = (
  run: (app: ReturnType<typeof createApp>, records: readonly LogRecord[]) => Promise<void>,
) =>
  withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
    await migrate({ connectionString: migratorUrl });
    const db = createPostgresDatabase({ url: appUrl });
    const records: LogRecord[] = [];
    const log = (record: LogRecord) => {
      records.push(record);
    };
    try {
      const auth = createIdentityAuth({ db, secret: SECRET, baseURL: BASE_URL, log });
      await run(createApp({ db, auth, log }), records);
    } finally {
      await db.close();
    }
  });

const postJson = (app: ReturnType<typeof createApp>, path: string, body: unknown) =>
  app.request(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE_URL },
    body: JSON.stringify(body),
  });

const ADA = { name: "Ada Lovelace", email: "ada@dezyn.test", password: "un-mot-de-passe-solide" };

describe("identité : inscription et connexion", () => {
  it("une inscription crée un utilisateur avec un identifiant UUID", () =>
    withIdentityApp(async (app) => {
      const response = await postJson(app, "/auth/sign-up/email", ADA);

      expect(response.status).toBe(200);
      const { user } = await response.json();
      expect(user).toMatchObject({ name: "Ada Lovelace", email: "ada@dezyn.test" });
      expect(user.id).toMatch(UUID_V4);
    }));

  it("une connexion avec le bon mot de passe ouvre une session", () =>
    withIdentityApp(async (app) => {
      await postJson(app, "/auth/sign-up/email", ADA);

      const signIn = await postJson(app, "/auth/sign-in/email", {
        email: ADA.email,
        password: ADA.password,
      });

      expect(signIn.status).toBe(200);
      const cookie = signIn.headers.get("set-cookie") ?? "";
      expect(cookie).toMatch(/better-auth\.session_token=[^;]+/);
      const session = await app.request(`${BASE_URL}/auth/get-session`, { headers: { cookie } });
      expect(await session.json()).toMatchObject({ user: { email: ADA.email } });
    }));

  it("un mauvais mot de passe répond 401, sans dire si l'email existe", () =>
    withIdentityApp(async (app) => {
      await postJson(app, "/auth/sign-up/email", ADA);

      const wrongPassword = await postJson(app, "/auth/sign-in/email", {
        email: ADA.email,
        password: "pas-le-bon-mot",
      });
      const unknownEmail = await postJson(app, "/auth/sign-in/email", {
        email: "inconnu@dezyn.test",
        password: "pas-le-bon-mot",
      });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.headers.get("set-cookie")).toBeNull();
      expect(await wrongPassword.json()).toEqual(await unknownEmail.json());
    }));

  it("les logs de better-auth passent par le log de l'API", () =>
    withIdentityApp(async (app, records) => {
      await postJson(app, "/auth/sign-up/email", ADA);

      await postJson(app, "/auth/sign-in/email", { email: ADA.email, password: "pas-le-bon-mot" });

      expect(records).toContainEqual({
        level: "warn",
        msg: "Invalid password",
        source: "better-auth",
      });
    }));
});
