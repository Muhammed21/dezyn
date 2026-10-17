import { describe, expect, it } from "vitest";

import { makeApp, makeAuth } from "../../testing/make-app.ts";

const recordingAuth = () => {
  const received: Request[] = [];
  const auth = makeAuth({
    handle: (request) => {
      received.push(request);
      return Promise.resolve(Response.json({ handledBy: "auth" }, { status: 200 }));
    },
  });
  return { auth, received };
};

describe("montage de l'authentification", () => {
  it.each(["GET", "POST"])(
    "délègue %s /auth/* à l'authentification, avec la requête d'origine",
    async (method) => {
      const { auth, received } = recordingAuth();
      const { app } = makeApp({ auth });

      const response = await app.request("/auth/sign-in/email?redirect=1", {
        method,
        headers: { "x-test": "origine" },
        ...(method === "POST" ? { body: "{}" } : {}),
      });

      expect(await response.json()).toEqual({ handledBy: "auth" });
      expect(
        received.map((request) => [
          request.method,
          new URL(request.url).pathname,
          request.headers.get("x-test"),
        ]),
      ).toEqual([[method, "/auth/sign-in/email", "origine"]]);
    },
  );

  it("ne délègue pas une route hors de /auth", async () => {
    const { auth, received } = recordingAuth();
    const { app } = makeApp({ auth });

    await app.request("/authentification");

    expect(received).toEqual([]);
  });
});
