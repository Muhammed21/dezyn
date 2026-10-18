import { randomInt } from "node:crypto";

import { describe, expect, it } from "vitest";

import { migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { createApp } from "../../create-app.ts";
import type { LogRecord } from "../../platform/logging.ts";
import { createPostgresDatabase } from "../../platform/postgres-database.ts";
import { makeHistory, makeProjects, makeSpaces, makeTokens } from "../../testing/make-app.ts";
import { createIdentityAuth } from "./infrastructure/better-auth.ts";

const BASE_URL = "http://127.0.0.1:3000";
const SECRET = "secret-de-test-de-32-caracteres-au-moins";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type IdentityApp = {
  readonly app: ReturnType<typeof createApp>;
  readonly records: readonly LogRecord[];
  readonly postJson: (path: string, body: unknown) => Promise<Response>;
};

const postJsonFrom =
  (app: ReturnType<typeof createApp>, clientIp: string) => async (path: string, body: unknown) =>
    app.request(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE_URL,
        "x-forwarded-for": clientIp,
      },
      body: JSON.stringify(body),
    });

const withIdentityApp = (run: (identityApp: IdentityApp) => Promise<void>) =>
  withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
    await migrate({ connectionString: migratorUrl });
    const db = createPostgresDatabase({ url: appUrl });
    const records: LogRecord[] = [];
    const log = (record: LogRecord) => {
      records.push(record);
    };
    try {
      const auth = await createIdentityAuth({
        db,
        secret: SECRET,
        baseURL: BASE_URL,
        trustedIpHeader: "x-forwarded-for",
        log,
        onUserCreated: () => Promise.resolve(),
      });
      const app = createApp({
        db,
        auth,
        log,
        spaces: makeSpaces(),
        projects: makeProjects(),
        history: makeHistory(),
        tokens: makeTokens(),
      });
      await run({ app, records, postJson: postJsonFrom(app, `198.51.100.${randomInt(1, 255)}`) });
    } finally {
      await db.close();
    }
  });

const ADA = { name: "Ada Lovelace", email: "ada@dezyn.test", password: "un-mot-de-passe-solide" };

describe("identité : inscription et connexion", () => {
  it("une inscription crée un utilisateur avec un identifiant UUID", () =>
    withIdentityApp(async ({ postJson }) => {
      const response = await postJson("/auth/sign-up/email", ADA);

      expect(response.status).toBe(200);
      const { user } = await response.json();
      expect(user).toMatchObject({ name: "Ada Lovelace", email: "ada@dezyn.test" });
      expect(user.id).toMatch(UUID_V4);
    }));

  it("une connexion avec le bon mot de passe ouvre une session", () =>
    withIdentityApp(async ({ app, postJson }) => {
      await postJson("/auth/sign-up/email", ADA);

      const signIn = await postJson("/auth/sign-in/email", {
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
    withIdentityApp(async ({ postJson }) => {
      await postJson("/auth/sign-up/email", ADA);

      const wrongPassword = await postJson("/auth/sign-in/email", {
        email: ADA.email,
        password: "pas-le-bon-mot",
      });
      const unknownEmail = await postJson("/auth/sign-in/email", {
        email: "inconnu@dezyn.test",
        password: "pas-le-bon-mot",
      });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.headers.get("set-cookie")).toBeNull();
      expect(await wrongPassword.json()).toEqual(await unknownEmail.json());
    }));

  it("les logs de better-auth passent par le log de l'API", () =>
    withIdentityApp(async ({ records, postJson }) => {
      await postJson("/auth/sign-up/email", ADA);

      await postJson("/auth/sign-in/email", { email: ADA.email, password: "pas-le-bon-mot" });

      expect(records).toContainEqual({
        level: "warn",
        msg: "Invalid password",
        source: "better-auth",
      });
    }));
});
