import { createHash, randomBytes, randomInt } from "node:crypto";

import { migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";

import { createApp } from "../create-app.ts";
import { createIdentityAuth } from "../modules/identity/infrastructure/better-auth.ts";
import { createPostgresDatabase, type PostgresDatabase } from "../platform/postgres-database.ts";

export const BASE_URL = "http://127.0.0.1:3000";
export const RESOURCE = `${BASE_URL}/v1`;
export const CLIENT_REDIRECT = "http://localhost:33418/callback";
export const ADA = {
  name: "Ada Lovelace",
  email: "ada@dezyn.test",
  password: "un-mot-de-passe-solide",
};

export type App = ReturnType<typeof createApp>;

export const withIdentityApp = (
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

export const makeClientIp = () => `198.51.100.${randomInt(1, 255)}`;

export const makeBrowser = (app: App, ip: string) => {
  const jar = new Map<string, string>();
  const send = async (path: string, init: RequestInit = {}, origin = BASE_URL) => {
    const response = await app.request(new URL(path, BASE_URL).href, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers)),
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
    postJson: async (path: string, body: unknown) =>
      send(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
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

export const formFields = (html: string) => ({
  csrf: hiddenField(html, "csrf"),
  oauth_query: hiddenField(html, "oauth_query").replaceAll("&amp;", "&"),
});

export const makePkce = () => {
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

export const signUp = async (app: App, ip: string): Promise<string> => {
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

export const decodeJwtPart = (token: string, index: number): unknown =>
  JSON.parse(Buffer.from(token.split(".")[index] ?? "", "base64url").toString());

export const exchangeCode = (
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

export const reachConsent = async (
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

export const signInAndConsent = async (app: App, { accept }: { accept: boolean }) => {
  const { browser, consentHtml, ...flow } = await reachConsent(app);
  const backToClient = await browser.postForm("/consent", {
    ...formFields(consentHtml),
    accept: String(accept),
  });

  return {
    ...flow,
    browser,
    consentHtml,
    callback: new URL(backToClient.headers.get("location") ?? "", BASE_URL),
  };
};

export const obtainAccessToken = async (app: App) => {
  const { clientId, userId, pkce, browser, callback } = await signInAndConsent(app, {
    accept: true,
  });
  const token = await exchangeCode(app, {
    clientId,
    code: callback.searchParams.get("code") ?? "",
    verifier: pkce.verifier,
  });
  const { access_token: accessToken, refresh_token: refreshToken } = await token.json();
  return {
    clientId,
    userId,
    browser,
    accessToken: String(accessToken),
    refreshToken: String(refreshToken),
  };
};

export const refreshTokens = (
  app: App,
  { clientId, refreshToken }: { clientId: string; refreshToken: string },
) =>
  app.request(`${BASE_URL}/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      resource: RESOURCE,
    }).toString(),
  });

export const callMcp = (
  app: App,
  {
    token,
    authorization = token === undefined ? undefined : `Bearer ${token}`,
    method,
    params = {},
  }: { token?: string; authorization?: string; method: string; params?: object },
) =>
  app.request(`${BASE_URL}/v1/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(authorization === undefined ? {} : { authorization }),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
