import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  callMcp,
  decodeJwtPart,
  obtainAccessToken,
  refreshTokens,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { schema } from "@repo/db";

const DAY_MS = 86_400_000;

const hashOf = (token: string) => createHash("sha256").update(token).digest("base64url");

describe("refresh des jetons de l'IA (ADR 0018 §3 et §4)", () => {
  it("un rejeu dans la fenêtre de tolérance est accepté", () =>
    withIdentityApp(async (app) => {
      const { clientId, refreshToken } = await obtainAccessToken(app);

      const first = await refreshTokens(app, { clientId, refreshToken });
      const replay = await refreshTokens(app, { clientId, refreshToken });

      expect([first.status, replay.status]).toEqual([200, 200]);
    }));

  it("un refresh token inconnu répond invalid_grant", () =>
    withIdentityApp(async (app) => {
      const { clientId } = await obtainAccessToken(app);

      const response = await refreshTokens(app, { clientId, refreshToken: "jeton-inconnu" });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_grant" });
    }));

  it("le jeton d'accès émis vit 15 minutes", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const { exp, iat } = z
        .object({ exp: z.number(), iat: z.number() })
        .parse(decodeJwtPart(accessToken, 1));
      expect(exp - iat).toBe(15 * 60);
    }));

  it("le refresh token émis vit 60 jours", () =>
    withIdentityApp(async (app, db) => {
      const issuedAt = Date.now();
      const { refreshToken } = await obtainAccessToken(app);

      const [stored] = await db.orm
        .select({ expiresAt: schema.identityOAuthRefreshToken.expiresAt })
        .from(schema.identityOAuthRefreshToken)
        .where(eq(schema.identityOAuthRefreshToken.token, hashOf(refreshToken)));

      expect(stored?.expiresAt.getTime()).toBeGreaterThanOrEqual(issuedAt + 60 * DAY_MS - 1000);
      expect(stored?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 60 * DAY_MS + 1000);
    }));

  it("un rejeu hors fenêtre révoque toutes les sessions, et le jeton d'accès suivant répond 401", () =>
    withIdentityApp(async (app, db) => {
      const { clientId, userId, refreshToken } = await obtainAccessToken(app);
      const rotated = await refreshTokens(app, { clientId, refreshToken });
      const { access_token: accessToken } = await rotated.json();
      await db.orm
        .update(schema.identityOAuthRefreshToken)
        .set({ rotationReplayExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.identityOAuthRefreshToken.token, hashOf(refreshToken)));
      const before = await callMcp(app, { token: accessToken, method: "tools/list" });

      const replay = await refreshTokens(app, { clientId, refreshToken });
      const after = await callMcp(app, { token: accessToken, method: "tools/list" });
      const sessions = await db.orm
        .select({ id: schema.identitySession.id })
        .from(schema.identitySession)
        .where(eq(schema.identitySession.userId, userId));

      expect(before.status).toBe(200);
      expect(replay.status).toBe(400);
      expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
      expect(after.status).toBe(401);
      expect(sessions).toEqual([]);
    }));

  it("au-delà de la durée de vie absolue, le refresh répond invalid_grant", () =>
    withIdentityApp(async (app, db) => {
      const { clientId, refreshToken } = await obtainAccessToken(app);
      await db.orm
        .update(schema.identityOAuthRefreshToken)
        .set({ authTime: new Date(Date.now() - 181 * DAY_MS) })
        .where(eq(schema.identityOAuthRefreshToken.token, hashOf(refreshToken)));

      const response = await refreshTokens(app, { clientId, refreshToken });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_grant" });
    }));

  it("après la déconnexion de l'utilisateur, le refresh répond invalid_grant", () =>
    withIdentityApp(async (app) => {
      const { clientId, refreshToken, browser } = await obtainAccessToken(app);
      await browser.postJson("/auth/sign-out", {});

      const response = await refreshTokens(app, { clientId, refreshToken });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_grant" });
    }));
});
