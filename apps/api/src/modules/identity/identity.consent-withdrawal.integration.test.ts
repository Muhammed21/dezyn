import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type App,
  authorizeAnotherAi,
  callMcp,
  obtainAccessToken,
  refreshTokens,
  withIdentityApp,
} from "../../testing/authorization-flow.ts";

const Consents = z.array(z.object({ id: z.string(), clientId: z.string() }));

const withdrawAccess = async ({
  browser,
  clientId,
}: Awaited<ReturnType<typeof obtainAccessToken>>) => {
  const consents = Consents.parse(await (await browser.get("/auth/oauth2/get-consents")).json());
  const consent = consents.find((candidate) => candidate.clientId === clientId);
  return browser.postJson("/auth/oauth2/delete-consent", { id: consent?.id ?? "" });
};

const listTools = (app: App, accessToken: string) =>
  callMcp(app, { token: accessToken, method: "tools/list" });

describe("retrait de l'accès d'une IA par l'utilisateur (ADR 0018 §2)", () => {
  it("le jeton de l'IA retirée répond 401 invalid_token à l'appel suivant", () =>
    withIdentityApp(async (app) => {
      const ai = await obtainAccessToken(app);
      const before = await listTools(app, ai.accessToken);

      const withdrawal = await withdrawAccess(ai);
      const after = await listTools(app, ai.accessToken);

      expect([before.status, withdrawal.status, after.status]).toEqual([200, 200, 401]);
      expect(after.headers.get("www-authenticate")).toContain('error="invalid_token"');
    }));

  it("l'IA retirée ne peut plus rafraîchir ses jetons, une autre IA le peut encore", () =>
    withIdentityApp(async (app) => {
      const withdrawn = await obtainAccessToken(app);
      const other = await authorizeAnotherAi(app, {
        browser: withdrawn.browser,
        clientName: "ChatGPT",
      });

      await withdrawAccess(withdrawn);
      const refused = await refreshTokens(app, withdrawn);
      const kept = await refreshTokens(app, other);

      expect(refused.status).toBe(400);
      expect(await refused.json()).toMatchObject({ error: "invalid_grant" });
      expect(kept.status).toBe(200);
    }));

  it("retirer une IA laisse fonctionner les autres IA et la session du navigateur", () =>
    withIdentityApp(async (app) => {
      const withdrawn = await obtainAccessToken(app);
      const other = await authorizeAnotherAi(app, {
        browser: withdrawn.browser,
        clientName: "ChatGPT",
      });

      await withdrawAccess(withdrawn);
      const otherAi = await listTools(app, other.accessToken);
      const session = await withdrawn.browser.get("/auth/get-session");

      expect(otherAi.status).toBe(200);
      expect(await session.json()).toMatchObject({ user: { id: withdrawn.userId } });
    }));
});
