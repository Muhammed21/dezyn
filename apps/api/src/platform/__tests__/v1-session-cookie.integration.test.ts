import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createPostgresDatabase } from "#db";
import { ProjectsOutput } from "#modules/project/contracts/projects.ts";
import type { LogRecord } from "#platform/logging.ts";
import {
  ADA,
  type App,
  BASE_URL,
  makeClientIp,
  signUp,
  WEB_URL,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { personalSpaceOf } from "#testing/space-fixtures.ts";

const signInCookie = async (app: App, ip: string) => {
  const response = await app.request(`${BASE_URL}/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE_URL, "x-forwarded-for": ip },
    body: JSON.stringify({ email: ADA.email, password: ADA.password }),
  });
  const [pair = ""] = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
  return pair;
};

const signedInAda = async (app: App) => {
  const ip = makeClientIp();
  const userId = await signUp(app, ip);
  return { ip, userId, cookie: await signInCookie(app, ip) };
};

const revokeSessionReads = async (migratorUrl: string) => {
  const migrator = createPostgresDatabase({ url: migratorUrl });
  try {
    await migrator.orm.execute(sql`REVOKE SELECT ON identity_session FROM app`);
  } finally {
    await migrator.close();
  }
};

const createProjectByCookie = (
  app: App,
  { spaceId, headers }: { spaceId: string; headers: Record<string, string> },
) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ name: "Projet écrit par cookie" }),
  });

const projectNamesOf = async (
  app: App,
  { spaceId, cookie }: { spaceId: string; cookie: string },
) => {
  const listed = await app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    headers: { cookie },
  });
  const { projects } = ProjectsOutput.parse(await listed.json());
  return projects.map(({ name }) => name);
};

const listSpaces = (app: App, headers: Record<string, string>) =>
  app.request(`${BASE_URL}/v1/spaces`, { headers });

describe("/v1 avec le cookie de session de l'app web (ADR 0044)", () => {
  it("un membre connecté lit ses espaces avec son seul cookie", () =>
    withIdentityApp(async (app, db) => {
      const { userId, cookie } = await signedInAda(app);

      const response = await listSpaces(app, { cookie });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        spaces: [
          { id: await personalSpaceOf(db, userId), name: ADA.name, plan: "free", role: "owner" },
        ],
      });
    }));

  it("après la déconnexion, le même cookie reçoit 401", () =>
    withIdentityApp(async (app) => {
      const { ip, cookie } = await signedInAda(app);
      await app.request(`${BASE_URL}/auth/sign-out`, {
        method: "POST",
        headers: { cookie, origin: BASE_URL, "x-forwarded-for": ip },
      });

      const response = await listSpaces(app, { cookie });

      expect(response.status).toBe(401);
    }));

  it("un en-tête Authorization invalide décide seul, même avec un cookie valide", () =>
    withIdentityApp(async (app) => {
      const { cookie } = await signedInAda(app);

      const response = await listSpaces(app, { cookie, authorization: "Bearer pas-un-jeton" });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
    }));

  it("le MCP refuse un cookie seul", () =>
    withIdentityApp(async (app) => {
      const { cookie } = await signedInAda(app);

      const response = await app.request(`${BASE_URL}/v1/mcp`, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });

      expect(response.status).toBe(401);
    }));

  it("une session illisible en base répond 503 et le journalise", async () => {
    const records: LogRecord[] = [];
    await withIdentityApp(
      async (app, _db, { migratorUrl }) => {
        const { cookie } = await signedInAda(app);
        await revokeSessionReads(migratorUrl);

        const response = await listSpaces(app, { cookie });

        expect(response.status).toBe(503);
        expect(records).toContainEqual(
          expect.objectContaining({ level: "error", msg: "session check failed" }),
        );
      },
      { authLog: (record) => records.push(record) },
    );
  });

  it("une écriture par cookie depuis l'origine de WEB_URL crée le projet", () =>
    withIdentityApp(async (app, db) => {
      const { userId, cookie } = await signedInAda(app);
      const spaceId = await personalSpaceOf(db, userId);

      const response = await createProjectByCookie(app, {
        spaceId,
        headers: { cookie, origin: WEB_URL },
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ spaceId, name: "Projet écrit par cookie" });
      expect(await projectNamesOf(app, { spaceId, cookie })).toEqual(["Projet écrit par cookie"]);
    }));

  it.each([
    ["depuis une autre origine", { origin: BASE_URL }],
    ["sans en-tête Origin", {}],
  ])("une écriture par cookie %s est refusée en 403 et ne crée rien", (_case, origin) =>
    withIdentityApp(async (app, db) => {
      const { userId, cookie } = await signedInAda(app);
      const spaceId = await personalSpaceOf(db, userId);

      const response = await createProjectByCookie(app, {
        spaceId,
        headers: { cookie, ...origin },
      });

      expect(response.status).toBe(403);
      expect(await projectNamesOf(app, { spaceId, cookie })).toEqual([]);
    }),
  );
});
