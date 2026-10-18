import { createHash, randomBytes, randomInt } from "node:crypto";

import { describe, expect, it } from "vitest";

import { migrate, schema } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { createApp } from "../../create-app.ts";
import { createPostgresDatabase, type PostgresDatabase } from "../../platform/postgres-database.ts";
import { createIdentityAuth } from "./infrastructure/better-auth.ts";

const BASE_URL = "http://127.0.0.1:3000";
const RESOURCE = `${BASE_URL}/v1`;
const CLIENT_REDIRECT = "http://localhost:33418/callback";
const ADA = { name: "Ada Lovelace", email: "ada@dezyn.test", password: "un-mot-de-passe-solide" };

type App = ReturnType<typeof createApp>;

const withIdentityApp = (
  run: (app: App, db: PostgresDatabase) => Promise<void>,
  { baseURL = BASE_URL }: { readonly baseURL?: string } = {},
) =>
  withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
    await migrate({ connectionString: migratorUrl });
    const db = createPostgresDatabase({ url: appUrl });
    try {
      const auth = await createIdentityAuth({
        db,
        secret: "secret-de-test-de-32-caracteres-au-moins",
        baseURL,
        trustedIpHeader: "x-forwarded-for",
        log: () => undefined,
      });
      await run(createApp({ db, auth, log: () => undefined }), db);
    } finally {
      await db.close();
    }
  });

const makeClientIp = () => `198.51.100.${randomInt(1, 255)}`;

const makeBrowser = (app: App, ip: string) => {
  const jar = new Map<string, string>();
  const send = async (path: string, init: RequestInit = {}, origin = BASE_URL) => {
    const response = await app.request(new URL(path, BASE_URL).href, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers)),
        origin,
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
  const follow = async (response: Response): Promise<Response> => {
    const location = response.headers.get("location");
    if (location === null || !new URL(location, BASE_URL).href.startsWith(BASE_URL)) {
      return response;
    }
    return follow(await send(location));
  };
  return {
    get: async (path: string) => follow(await send(path)),
    postForm: async (
      path: string,
      fields: Readonly<Record<string, string>>,
      { origin = BASE_URL }: { readonly origin?: string } = {},
    ) =>
      follow(
        await send(
          path,
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(fields).toString(),
          },
          origin,
        ),
      ),
  };
};

const hiddenField = (html: string, name: string): string =>
  new RegExp(`name="${name}" value="([^"]*)"`).exec(html)?.[1] ?? "";

const formFields = (html: string) => ({
  csrf: hiddenField(html, "csrf"),
  oauth_query: hiddenField(html, "oauth_query").replaceAll("&amp;", "&"),
});

const makePkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

const registerClient = async (
  app: App,
  { ip, clientName }: { ip: string; clientName: string },
): Promise<string> => {
  const response = await app.request(`${BASE_URL}/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [CLIENT_REDIRECT],
      token_endpoint_auth_method: "none",
    }),
  });
  const { client_id: clientId } = await response.json();
  return clientId;
};

const signUp = async (app: App, ip: string): Promise<string> => {
  const response = await app.request(`${BASE_URL}/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE_URL, "x-forwarded-for": ip },
    body: JSON.stringify(ADA),
  });
  const { user } = await response.json();
  return user.id;
};

const authorizePath = ({ clientId, challenge }: { clientId: string; challenge: string }) =>
  `/auth/oauth2/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CLIENT_REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "etat-du-client",
    resource: RESOURCE,
  })}`;

const decodeJwtPart = (token: string, index: number): unknown =>
  JSON.parse(Buffer.from(token.split(".")[index] ?? "", "base64url").toString());

const exchangeCode = (
  app: App,
  { clientId, code, verifier }: { clientId: string; code: string; verifier: string },
) =>
  app.request(`${BASE_URL}/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: CLIENT_REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
      resource: RESOURCE,
    }).toString(),
  });

const reachConsent = async (
  app: App,
  {
    clientName = "Claude Code",
    password = ADA.password,
  }: { readonly clientName?: string; readonly password?: string } = {},
) => {
  const ip = makeClientIp();
  const clientId = await registerClient(app, { ip, clientName });
  const userId = await signUp(app, ip);
  const pkce = makePkce();
  const browser = makeBrowser(app, ip);

  const loginPage = await browser.get(authorizePath({ clientId, challenge: pkce.challenge }));
  const consentPage = await browser.postForm("/login", {
    ...formFields(await loginPage.text()),
    email: ADA.email,
    password,
  });
  return {
    clientId,
    userId,
    pkce,
    browser,
    status: consentPage.status,
    consentHtml: await consentPage.text(),
  };
};

const signInAndConsent = async (app: App, { accept }: { accept: boolean }) => {
  const { browser, consentHtml, ...flow } = await reachConsent(app);
  const backToClient = await browser.postForm("/consent", {
    ...formFields(consentHtml),
    accept: String(accept),
  });

  return {
    ...flow,
    consentHtml,
    callback: new URL(backToClient.headers.get("location") ?? "", BASE_URL),
  };
};

describe("autorisation d'une IA par l'utilisateur", () => {
  it("l'IA autorisée reçoit un jeton at+jwt pour la ressource /v1, au nom de l'utilisateur", () =>
    withIdentityApp(async (app) => {
      const { clientId, userId, pkce, consentHtml, callback } = await signInAndConsent(app, {
        accept: true,
      });

      expect(consentHtml).toContain("Claude Code");
      expect(`${callback.origin}${callback.pathname}`).toBe(CLIENT_REDIRECT);
      expect(callback.searchParams.get("state")).toBe("etat-du-client");
      const token = await exchangeCode(app, {
        clientId,
        code: callback.searchParams.get("code") ?? "",
        verifier: pkce.verifier,
      });
      expect(token.status).toBe(200);
      const { access_token: accessToken } = await token.json();
      expect(decodeJwtPart(accessToken, 0)).toMatchObject({ typ: "at+jwt" });
      expect(decodeJwtPart(accessToken, 1)).toMatchObject({ aud: RESOURCE, sub: userId });
    }));

  it("un refus renvoie l'utilisateur vers le client avec access_denied, sans code", () =>
    withIdentityApp(async (app) => {
      const { callback } = await signInAndConsent(app, { accept: false });

      expect(`${callback.origin}${callback.pathname}`).toBe(CLIENT_REDIRECT);
      expect(callback.searchParams.get("error")).toBe("access_denied");
      expect(callback.searchParams.get("state")).toBe("etat-du-client");
      expect(callback.searchParams.has("code")).toBe(false);
    }));

  it("un échange de code sans le bon code_verifier est refusé", () =>
    withIdentityApp(async (app) => {
      const { clientId, callback } = await signInAndConsent(app, { accept: true });

      const token = await exchangeCode(app, {
        clientId,
        code: callback.searchParams.get("code") ?? "",
        verifier: makePkce().verifier,
      });

      expect(token.status).toBe(401);
      const body = await token.json();
      expect(body).toMatchObject({ error: "invalid_request" });
      expect(body).not.toHaveProperty("access_token");
    }));

  it("le refresh token n'est stocké que haché", () =>
    withIdentityApp(async (app, db) => {
      const { clientId, pkce, callback } = await signInAndConsent(app, { accept: true });
      const token = await exchangeCode(app, {
        clientId,
        code: callback.searchParams.get("code") ?? "",
        verifier: pkce.verifier,
      });
      const { refresh_token: refreshToken } = await token.json();

      const stored = await db.orm
        .select({ token: schema.identityOAuthRefreshToken.token })
        .from(schema.identityOAuthRefreshToken);

      expect(refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(stored).toEqual([
        { token: createHash("sha256").update(refreshToken).digest("base64url") },
      ]);
    }));

  it("un consentement sans le jeton du formulaire, ou venu d'une autre origine, est refusé", () =>
    withIdentityApp(async (app) => {
      const { browser, consentHtml } = await reachConsent(app);
      const fields = { ...formFields(consentHtml), accept: "true" };

      const withoutToken = await browser.postForm("/consent", { ...fields, csrf: "" });
      const otherToken = await browser.postForm("/consent", { ...fields, csrf: "un-autre-jeton" });
      const otherOrigin = await browser.postForm("/consent", fields, {
        origin: "https://pirate.example",
      });

      expect([withoutToken.status, otherToken.status, otherOrigin.status]).toEqual([403, 403, 403]);
      expect((await browser.postForm("/consent", fields)).headers.get("location")).toMatch(
        /^http:\/\/localhost:33418\/callback\?code=/,
      );
    }));

  it("un mauvais mot de passe réaffiche la connexion avec un message, sans aller au consentement", () =>
    withIdentityApp(async (app) => {
      const { status, consentHtml } = await reachConsent(app, { password: "pas-le-bon-mot" });

      expect(status).toBe(401);
      expect(consentHtml).toContain("Email ou mot de passe incorrect.");
      expect(consentHtml).not.toContain("demande l'accès");
    }));

  it("le nom du client est affiché comme du texte, jamais comme du HTML", () =>
    withIdentityApp(async (app) => {
      const { consentHtml } = await reachConsent(app, {
        clientName: `<script>alert("dezyn", 'mcp')</script>`,
      });

      expect(consentHtml).toContain(
        "&lt;script&gt;alert(&quot;dezyn&quot;, &#39;mcp&#39;)&lt;/script&gt;",
      );
      expect(consentHtml).not.toContain("<script>");
    }));

  it("la connexion refuse un formulaire sans le jeton de la page, ou venu d'une autre origine", () =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      const browser = makeBrowser(app, ip);
      const fields = {
        ...formFields(await (await browser.get("/login")).text()),
        email: ADA.email,
        password: ADA.password,
      };

      const withoutToken = await browser.postForm("/login", { ...fields, csrf: "" });
      const otherOrigin = await browser.postForm("/login", fields, {
        origin: "https://pirate.example",
      });
      const withoutCookie = await makeBrowser(app, ip).postForm("/login", { ...fields, csrf: "" });

      expect([withoutToken.status, otherOrigin.status, withoutCookie.status]).toEqual([
        403, 403, 403,
      ]);
      expect(await withoutToken.text()).toBe("Forbidden");
    }));

  it("la page de connexion n'est pas mise en cache et pose son jeton dans un cookie HttpOnly SameSite=Strict", () =>
    withIdentityApp(async (app) => {
      const response = await app.request(`${BASE_URL}/login`);

      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("set-cookie")).toMatch(
        /^dezyn_csrf=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict$/,
      );
      expect(await response.text()).not.toContain('role="alert"');
    }));

  it("une demande de consentement inconnue ou falsifiée affiche la page d'expiration", () =>
    withIdentityApp(async (app) => {
      const { browser, consentHtml } = await reachConsent(app);
      const fields = formFields(consentHtml);

      const unknownClient = await browser.get("/consent?client_id=inconnu");
      const tampered = await browser.postForm("/consent", {
        ...fields,
        oauth_query: fields.oauth_query.replace("state=etat-du-client", "state=autre"),
        accept: "true",
      });

      expect([unknownClient.status, tampered.status]).toEqual([400, 400]);
      expect(await unknownClient.text()).toContain("Cette demande a expiré.");
      expect(await tampered.text()).toContain("Cette demande a expiré.");
    }));

  it("derrière une adresse https, le cookie du jeton de la page est Secure", () =>
    withIdentityApp(
      async (app) => {
        const response = await app.request("https://dezyn.example/login");

        expect(response.headers.get("set-cookie")).toMatch(/; Secure(;|$)/);
      },
      { baseURL: "https://dezyn.example" },
    ));
});
