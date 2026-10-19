import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  callMcp,
  makeClientIp,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { schema } from "@repo/db";

const failingOnce = (created: (user: { id: string; name: string }) => Promise<void>) => {
  const calls = { count: 0 };
  return async (user: { id: string; name: string }) => {
    calls.count += 1;
    if (calls.count === 1) {
      throw new Error("création de l'espace impossible");
    }
    await created(user);
  };
};
const signUp = (app: App, ip: string) =>
  app.request(`${BASE_URL}/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE_URL, "x-forwarded-for": ip },
    body: JSON.stringify(ADA),
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("espace personnel à l'inscription", () => {
  it("après inscription, GET /v1/spaces renvoie son espace personnel, plan free, rôle owner", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await app.request(`${BASE_URL}/v1/spaces`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        spaces: [{ id: expect.stringMatching(UUID), name: ADA.name, plan: "free", role: "owner" }],
      });
    }));

  it("list_spaces renvoie la même liste que GET /v1/spaces", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);
      const api = await (
        await app.request(`${BASE_URL}/v1/spaces`, {
          headers: { authorization: `Bearer ${accessToken}` },
        })
      ).json();

      const response = await callMcp(app, {
        token: accessToken,
        method: "tools/call",
        params: { name: "list_spaces", arguments: {} },
      });

      expect(await response.json()).toMatchObject({
        result: {
          structuredContent: api,
          content: [{ type: "text", text: JSON.stringify(api) }],
        },
      });
    }));

  it("annonce list_spaces avec sa description et son schéma de sortie", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await callMcp(app, { token: accessToken, method: "tools/list" });

      expect(await response.json()).toMatchObject({
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "list_spaces",
              description:
                "Liste les espaces dont l'utilisateur est membre, avec son rôle et le plan de chacun.",
              outputSchema: expect.objectContaining({
                type: "object",
                properties: { spaces: expect.anything() },
              }),
            }),
          ]),
        },
      });
    }));

  it("si l'espace ne peut pas être créé, l'inscription échoue sans laisser d'utilisateur, et se refait ensuite", () =>
    withIdentityApp(
      async (app, db) => {
        const ip = makeClientIp();

        const failed = await signUp(app, ip);
        const usersAfterFailure = await db.orm.select().from(schema.identityUser);
        const retried = await signUp(app, ip);
        const spaces = await db.orm.select({ name: schema.space.name }).from(schema.space);

        expect(failed.ok).toBe(false);
        expect(usersAfterFailure).toEqual([]);
        expect(retried.status).toBe(200);
        expect(spaces).toEqual([{ name: ADA.name }]);
      },
      { wrapUserCreated: failingOnce },
    ));
});
