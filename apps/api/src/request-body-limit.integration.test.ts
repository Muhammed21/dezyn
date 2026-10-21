import { describe, expect, it } from "vitest";

import {
  type App,
  BASE_URL,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { personalSpaceOf, switchToTeam } from "#testing/space-fixtures.ts";
import { schema } from "@repo/db";

const ONE_MEGABYTE = 1024 * 1024;

const invitationOfSize = (size: number) => {
  const empty = JSON.stringify({ email: GRACE.email, padding: "" });
  return JSON.stringify({
    email: GRACE.email,
    padding: "x".repeat(size - empty.length),
  });
};

const inviteWithBody = (
  app: App,
  { accessToken, spaceId, body }: { accessToken: string; spaceId: string; body: string },
) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/invitations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body,
  });

describe("un corps de requête pèse 1 Mo au plus", () => {
  it("un corps de 1 Mo est traité", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);
      await switchToTeam(db, spaceId);

      const response = await inviteWithBody(app, {
        accessToken,
        spaceId,
        body: invitationOfSize(ONE_MEGABYTE),
      });

      expect(response.status).toBe(201);
    }));

  it("un corps d'un octet de plus répond 413, sans rien traiter", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);
      await switchToTeam(db, spaceId);

      const response = await inviteWithBody(app, {
        accessToken,
        spaceId,
        body: invitationOfSize(ONE_MEGABYTE + 1),
      });

      expect(response.status).toBe(413);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Corps de requête trop volumineux",
        status: 413,
      });
      expect(await db.orm.select().from(schema.spaceInvitation)).toEqual([]);
    }));

  it.each(["/auth/sign-in/email", "/login", "/consent"])(
    "une route sans jeton, comme %s, répond 413 au-delà de 1 Mo",
    (path) =>
      withIdentityApp(async (app) => {
        const response = await app.request(`${BASE_URL}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: invitationOfSize(ONE_MEGABYTE + 1),
        });

        expect(response.status).toBe(413);
      }),
  );
});
