import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  makeClientIp,
  WEB_URL,
  withIdentityApp,
} from "#testing/authorization-flow.ts";

const makeWebBrowser = (app: App) => {
  const ip = makeClientIp();
  const jar = new Map<string, string>();
  return async (path: string, init: RequestInit = {}) => {
    const response = await app.request(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers)),
        origin: WEB_URL,
        "x-forwarded-for": ip,
        cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      },
    });
    response.headers.getSetCookie().forEach((cookie) => {
      const [pair = ""] = cookie.split(";");
      const separator = pair.indexOf("=");
      jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    });
    return response;
  };
};

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const SIGN_IN = { email: ADA.email, password: ADA.password };

const tokenPaths = (value: unknown, path = "$"): readonly string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => tokenPaths(item, `${path}[${index}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => [
      ...(key === "token" ? [`${path}.${key}`] : []),
      ...tokenPaths(child, `${path}.${key}`),
    ]);
  }
  return [];
};

describe("aucune réponse de /auth ne donne le jeton de session au JavaScript", () => {
  it("l'inscription ouvre une session sans renvoyer son jeton", () =>
    withIdentityApp(async (app) => {
      const browse = makeWebBrowser(app);

      const response = await browse("/auth/sign-up/email", postJson(ADA));
      const body: unknown = await response.json();

      expect(response.status).toBe(200);
      expect(tokenPaths(body)).toEqual([]);
      expect(body).toMatchObject({ user: { email: ADA.email, name: ADA.name } });
      expect((await browse("/v1/spaces")).status).toBe(200);
    }));

  it("la connexion ouvre une session sans renvoyer son jeton", () =>
    withIdentityApp(async (app) => {
      await makeWebBrowser(app)("/auth/sign-up/email", postJson(ADA));
      const browse = makeWebBrowser(app);

      const response = await browse("/auth/sign-in/email", postJson(SIGN_IN));
      const body: unknown = await response.json();

      expect(response.status).toBe(200);
      expect(tokenPaths(body)).toEqual([]);
      expect(body).toMatchObject({ redirect: false, user: { email: ADA.email } });
      expect((await browse("/v1/spaces")).status).toBe(200);
    }));

  it("la session courante se lit sans son jeton, ni JWT en en-tête", () =>
    withIdentityApp(async (app) => {
      const browse = makeWebBrowser(app);
      const signedUp = await (await browse("/auth/sign-up/email", postJson(ADA))).json();

      const response = await browse("/auth/get-session");
      const body: unknown = await response.json();

      expect(response.status).toBe(200);
      expect(tokenPaths(body)).toEqual([]);
      expect(body).toMatchObject({
        session: { userId: signedUp.user.id },
        user: { id: signedUp.user.id, email: ADA.email },
      });
      expect(response.headers.get("set-auth-jwt")).toBeNull();
    }));

  it("la liste des sessions ne donne le jeton d'aucune d'elles", () =>
    withIdentityApp(async (app) => {
      await makeWebBrowser(app)("/auth/sign-up/email", postJson(ADA));
      const browse = makeWebBrowser(app);
      await browse("/auth/sign-in/email", postJson(SIGN_IN));

      const response = await browse("/auth/list-sessions");
      const body: unknown = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveLength(2);
      expect(tokenPaths(body)).toEqual([]);
      expect(body).toEqual([
        expect.objectContaining({ id: expect.any(String) }),
        expect.objectContaining({ id: expect.any(String) }),
      ]);
    }));

  it("/auth/token ne délivre pas de JWT à un appel par cookie", () =>
    withIdentityApp(async (app) => {
      const browse = makeWebBrowser(app);
      await browse("/auth/sign-up/email", postJson(ADA));

      const response = await browse("/auth/token");

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not Found");
    }));
});
