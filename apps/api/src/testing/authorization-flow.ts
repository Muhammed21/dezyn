import { createHash, randomBytes, randomInt } from "node:crypto";

import { composeModules } from "#compose-modules";
import { createApp } from "#create-app";
import { createPostgresDatabase, type PostgresDatabase } from "#db";
import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import { createIdentityAuth } from "#modules/identity/infrastructure/better-auth.ts";
import type { Clock } from "#platform/clock.ts";
import type { Mailer } from "#platform/mailer.ts";
import { migrate } from "@repo/db";
import { withThrowawayDatabase } from "@repo/db/testing";
import { ok } from "@repo/result";

export const BASE_URL = "http://127.0.0.1:3000";
export const RESOURCE = `${BASE_URL}/v1`;
export const WEB_URL = "http://127.0.0.1:5173";
export const CLIENT_REDIRECT = "http://localhost:33418/callback";
export const ADA = {
  name: "Ada Lovelace",
  email: "ada@dezyn.test",
  password: "un-mot-de-passe-solide",
};
export const GRACE = {
  name: "Grace Hopper",
  email: "grace@dezyn.test",
  password: "un-autre-mot-de-passe-solide",
};

type User = typeof ADA;

export type App = ReturnType<typeof createApp>;

type UserCreated = (user: { readonly id: string; readonly name: string }) => Promise<void>;

export const withIdentityApp = (
  run: (
    app: App,
    db: PostgresDatabase,
    database: { readonly migratorUrl: string },
  ) => Promise<void>,
  {
    baseURL = BASE_URL,
    wrapUserCreated = (created) => created,
    mailer = { send: async () => ok(undefined) },
    wrapHistoryWriter,
    clock,
  }: {
    readonly baseURL?: string;
    readonly wrapUserCreated?: (created: UserCreated) => UserCreated;
    readonly mailer?: Mailer;
    readonly wrapHistoryWriter?: (writer: HistoryWriter) => HistoryWriter;
    readonly clock?: Clock;
  } = {},
) =>
  withThrowawayDatabase(async ({ migratorUrl, appUrl }) => {
    await migrate({ connectionString: migratorUrl });
    const db = createPostgresDatabase({ url: appUrl });
    try {
      const { spaces, projects, history, tokens, proposals } = composeModules({
        db,
        mailer,
        webUrl: WEB_URL,
        wrapHistoryWriter,
        clock,
      });
      const auth = await createIdentityAuth({
        db,
        secret: "secret-de-test-de-32-caracteres-au-moins",
        baseURL,
        trustedIpHeader: "x-forwarded-for",
        log: () => undefined,
        onUserCreated: wrapUserCreated(spaces.createPersonalSpace),
      });
      await run(
        createApp({ db, auth, log: () => undefined, spaces, projects, history, tokens, proposals }),
        db,
        { migratorUrl },
      );
    } finally {
      await db.close();
    }
  });

export const makeClientIp = () =>
  `198.${randomInt(18, 20)}.${randomInt(0, 256)}.${randomInt(0, 256)}`;

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

export const signUp = async (app: App, ip: string, user: User = ADA): Promise<string> => {
  const response = await app.request(`${BASE_URL}/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE_URL, "x-forwarded-for": ip },
    body: JSON.stringify(user),
  });
  const { user: created } = await response.json();
  return created.id;
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
  {
    clientId,
    code,
    verifier,
    ip = makeClientIp(),
  }: { clientId: string; code: string; verifier: string; ip?: string },
) =>
  app.request(`${BASE_URL}/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip },
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
    user = ADA,
    password = user.password,
    registeredId,
  }: {
    readonly clientName?: string;
    readonly user?: User;
    readonly password?: string;
    readonly registeredId?: string;
  } = {},
) => {
  const ip = makeClientIp();
  const clientId = await registerClient(app, { ip, clientName });
  const userId = registeredId ?? (await signUp(app, ip, user));
  const pkce = makePkce();
  const browser = makeBrowser(app, ip);

  const loginPage = await browser.get(authorizePath({ clientId, challenge: pkce.challenge }));
  const consentPage = await browser.postForm("/login", {
    ...formFields(await loginPage.text()),
    email: user.email,
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

export const signInAndConsent = async (
  app: App,
  {
    accept,
    user = ADA,
    registeredId,
  }: { readonly accept: boolean; readonly user?: User; readonly registeredId?: string },
) => {
  const { browser, consentHtml, ...flow } = await reachConsent(app, { user, registeredId });
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

export const obtainAccessToken = async (
  app: App,
  { user = ADA, registeredId }: { readonly user?: User; readonly registeredId?: string } = {},
) => {
  const { clientId, userId, pkce, browser, callback } = await signInAndConsent(app, {
    accept: true,
    user,
    registeredId,
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

type Browser = ReturnType<typeof makeBrowser>;

export const authorizeAnotherAi = async (
  app: App,
  { browser, clientName }: { readonly browser: Browser; readonly clientName: string },
) => {
  const clientId = await registerClient(app, { ip: makeClientIp(), clientName });
  const pkce = makePkce();
  const consentPage = await browser.get(authorizePath({ clientId, challenge: pkce.challenge }));
  const backToClient = await browser.postForm("/consent", {
    ...formFields(await consentPage.text()),
    accept: "true",
  });
  const callback = new URL(backToClient.headers.get("location") ?? "", BASE_URL);
  const token = await exchangeCode(app, {
    clientId,
    code: callback.searchParams.get("code") ?? "",
    verifier: pkce.verifier,
  });
  const { access_token: accessToken, refresh_token: refreshToken } = await token.json();
  return { clientId, accessToken: String(accessToken), refreshToken: String(refreshToken) };
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
    correlationId,
  }: {
    token?: string;
    authorization?: string;
    method: string;
    params?: object;
    correlationId?: string;
  },
) =>
  app.request(`${BASE_URL}/v1/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(authorization === undefined ? {} : { authorization }),
      ...(correlationId === undefined ? {} : { "x-correlation-id": correlationId }),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
