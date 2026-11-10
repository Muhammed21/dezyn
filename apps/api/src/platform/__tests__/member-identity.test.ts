import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity, VerificationFailure } from "@repo/auth-verifier";
import { err, ok, type Result } from "@repo/result";

import { type MemberEnv, requireMember, type SessionFailure } from "../member-identity.ts";

const RESOURCE_METADATA = "http://127.0.0.1:3000/.well-known/oauth-protected-resource/v1";
const ADA_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const GRACE_ID = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const SESSION_COOKIE = "better-auth.session_token=session-de-ada";

const makeTokenIdentity = (): AccessTokenIdentity => ({
  userId: GRACE_ID,
  sid: "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e",
  clientId: "client-claude-code",
  scopes: ["offline_access"],
});

const makeMemberApp = ({
  session = ok({ userId: ADA_ID }),
  verification = ok(makeTokenIdentity()),
}: {
  readonly session?: Result<{ readonly userId: string } | undefined, SessionFailure>;
  readonly verification?: Result<AccessTokenIdentity, VerificationFailure>;
} = {}) => {
  const cookiesRead: (string | null)[] = [];
  const tokens: string[] = [];
  const app = new Hono<MemberEnv>()
    .use(
      requireMember({
        sessionOf: (headers) => {
          cookiesRead.push(headers.get("cookie"));
          return Promise.resolve(session);
        },
        verifyAccessToken: (token) => {
          tokens.push(token);
          return Promise.resolve(verification);
        },
        resourceMetadataUrl: RESOURCE_METADATA,
      }),
    )
    .on(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"], "/protege", (c) =>
      c.json(c.get("identity")),
    );
  return { app, cookiesRead, tokens };
};

const call = (
  app: Hono<MemberEnv>,
  { method = "GET", headers = {} }: { method?: string; headers?: Record<string, string> } = {},
) => app.request("/protege", { method, headers });

describe("requireMember : l'identité d'un membre sur /v1 (ADR 0044 §1 et §2)", () => {
  it("sans en-tête Authorization, passe à la route le membre de la session du cookie", async () => {
    const { app, cookiesRead, tokens } = makeMemberApp();

    const response = await call(app, { headers: { cookie: SESSION_COOKIE } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: ADA_ID });
    expect(cookiesRead).toEqual([SESSION_COOKIE]);
    expect(tokens).toEqual([]);
  });

  it.each(["HEAD", "OPTIONS"])("une requête %s par cookie est une lecture", async (method) => {
    const { app } = makeMemberApp();

    const response = await call(app, { method, headers: { cookie: SESSION_COOKIE } });

    expect(response.status).toBe(200);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "une écriture %s par cookie répond 403, sans atteindre la route",
    async (method) => {
      const { app } = makeMemberApp();

      const response = await call(app, { method, headers: { cookie: SESSION_COOKIE } });

      expect(response.status).toBe(403);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Accès refusé",
        status: 403,
      });
    },
  );

  it("sans session, répond 401 avec les métadonnées de ressource", async () => {
    const { app } = makeMemberApp({ session: ok(undefined) });

    const response = await call(app, { method: "POST" });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${RESOURCE_METADATA}"`,
    );
    expect(await response.json()).toMatchObject({
      type: "about:blank",
      title: "Non authentifié",
      status: 401,
    });
  });

  it("une session illisible répond 503, sans demander de réauthentification", async () => {
    const { app } = makeMemberApp({ session: err("unavailable") });

    const response = await call(app, { headers: { cookie: SESSION_COOKIE } });

    expect(response.status).toBe(503);
    expect(response.headers.get("www-authenticate")).toBeNull();
    expect(await response.json()).toMatchObject({ title: "Service indisponible", status: 503 });
  });

  it("un jeton Bearer décide seul : le membre du jeton, même en écriture, sans lire le cookie", async () => {
    const { app, cookiesRead, tokens } = makeMemberApp();

    const response = await call(app, {
      method: "POST",
      headers: { authorization: "Bearer jeton-signe", cookie: SESSION_COOKIE },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: GRACE_ID });
    expect(tokens).toEqual(["jeton-signe"]);
    expect(cookiesRead).toEqual([]);
  });

  it("un jeton refusé répond 401 invalid_token, même avec un cookie valide", async () => {
    const { app, cookiesRead } = makeMemberApp({ verification: err("revoked") });

    const response = await call(app, {
      headers: { authorization: "Bearer jeton-revoque", cookie: SESSION_COOKIE },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer error="invalid_token", resource_metadata="${RESOURCE_METADATA}"`,
    );
    expect(cookiesRead).toEqual([]);
  });

  it.each([
    ["d'un autre schéma", "Basic YWRhOm1vdA=="],
    ["avec du texte avant Bearer", "xBearer jeton-signe"],
    ["avec du texte après le jeton", "Bearer jeton-signe en-trop"],
  ])(
    "un en-tête Authorization %s répond 401, même avec un cookie valide",
    async (_case, authorization) => {
      const { app, cookiesRead, tokens } = makeMemberApp();

      const response = await call(app, { headers: { authorization, cookie: SESSION_COOKIE } });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        `Bearer resource_metadata="${RESOURCE_METADATA}"`,
      );
      expect(cookiesRead).toEqual([]);
      expect(tokens).toEqual([]);
    },
  );

  it("un jeton illisible faute de base répond 503", async () => {
    const { app } = makeMemberApp({ verification: err("unavailable") });

    const response = await call(app, { headers: { authorization: "Bearer jeton-signe" } });

    expect(response.status).toBe(503);
  });
});
