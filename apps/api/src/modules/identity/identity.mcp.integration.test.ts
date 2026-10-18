import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { schema } from "@repo/db";

import {
  BASE_URL,
  callMcp,
  formFields,
  makeBrowser,
  makeClientIp,
  ADA,
  obtainAccessToken,
  signUp,
  withIdentityApp,
} from "../../testing/authorization-flow.ts";

const RESOURCE_METADATA = `${BASE_URL}/.well-known/oauth-protected-resource/v1`;

describe("MCP : l'IA autorisée appelle whoami", () => {
  it("sans jeton, répond 401 et pointe vers les métadonnées de ressource protégée", () =>
    withIdentityApp(async (app) => {
      const response = await callMcp(app, { method: "tools/list" });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        `Bearer resource_metadata="${RESOURCE_METADATA}"`,
      );
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Non authentifié",
        status: 401,
      });
    }));

  it.each([
    ["un autre schéma", (token: string) => `Token ${token}`],
    ["du texte après le jeton", (token: string) => `Bearer ${token} en-trop`],
    ["du texte avant Bearer", (token: string) => `xBearer ${token}`],
  ])("refuse un en-tête Authorization avec %s, même porteur d'un jeton valide", (_case, header) =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await callMcp(app, {
        authorization: header(accessToken),
        method: "tools/list",
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        `Bearer resource_metadata="${RESOURCE_METADATA}"`,
      );
    }),
  );

  it("avec un jeton invalide, répond 401 invalid_token", () =>
    withIdentityApp(async (app) => {
      const response = await callMcp(app, { token: "pas-un-jeton", method: "tools/list" });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        `Bearer error="invalid_token", resource_metadata="${RESOURCE_METADATA}"`,
      );
    }));

  it("avec un jeton valide, whoami renvoie l'utilisateur et le client OAuth", () =>
    withIdentityApp(async (app) => {
      const { accessToken, userId, clientId } = await obtainAccessToken(app);

      const response = await callMcp(app, {
        token: accessToken,
        method: "tools/call",
        params: { name: "whoami", arguments: {} },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        result: {
          structuredContent: { userId, clientId },
          content: [{ type: "text", text: JSON.stringify({ userId, clientId }) }],
        },
      });
    }));

  it("après la déconnexion de l'utilisateur, le jeton encore valide en signature répond 401", () =>
    withIdentityApp(async (app) => {
      const { accessToken, browser } = await obtainAccessToken(app);
      const before = await callMcp(app, { token: accessToken, method: "tools/list" });

      const signOut = await browser.postJson("/auth/sign-out", {});
      const after = await callMcp(app, { token: accessToken, method: "tools/list" });

      expect([before.status, signOut.status, after.status]).toEqual([200, 200, 401]);
      expect(after.headers.get("www-authenticate")).toBe(
        `Bearer error="invalid_token", resource_metadata="${RESOURCE_METADATA}"`,
      );
    }));

  it("une session expirée mais pas encore purgée rend le jeton refusé", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);

      await db.orm
        .update(schema.identitySession)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.identitySession.userId, userId));
      const response = await callMcp(app, { token: accessToken, method: "tools/list" });

      expect(response.status).toBe(401);
    }));

  it("annonce whoami avec sa description et son schéma de sortie, et se présente comme dezyn", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const tools = await callMcp(app, { token: accessToken, method: "tools/list" });
      const initialize = await callMcp(app, {
        token: accessToken,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      });

      expect(await tools.json()).toMatchObject({
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "whoami",
              description:
                "Renvoie l'utilisateur dezyn et le client OAuth au nom desquels l'IA agit.",
              outputSchema: expect.objectContaining({
                type: "object",
                properties: { userId: expect.anything(), clientId: expect.anything() },
              }),
            }),
          ]),
        },
      });
      expect(await initialize.json()).toMatchObject({
        result: { serverInfo: { name: "dezyn", version: "0.0.0" } },
      });
    }));

  it("le client MCP du SDK va de la découverte jusqu'à whoami, avec un refresh token", () =>
    withIdentityApp(async (app) => {
      const fetchFn = async (url: string | URL, init?: RequestInit) =>
        app.request(url.toString(), init);
      const redirectUrl = "http://localhost:33418/callback";
      const ip = makeClientIp();
      const userId = await signUp(app, ip);
      const browser = makeBrowser(app, ip);

      const info = await discoverOAuthServerInfo(`${BASE_URL}/v1/mcp`, { fetchFn });
      const clientInformation = await registerClient(info.authorizationServerUrl, {
        metadata: info.authorizationServerMetadata,
        clientMetadata: {
          client_name: "Claude Code",
          redirect_uris: [redirectUrl],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        },
        fetchFn,
      });
      const resource = new URL(info.resourceMetadata?.resource ?? "");
      const { authorizationUrl, codeVerifier } = await startAuthorization(
        info.authorizationServerUrl,
        {
          metadata: info.authorizationServerMetadata,
          clientInformation,
          redirectUrl,
          scope: info.resourceMetadata?.scopes_supported?.join(" "),
          state: "etat-du-client",
          resource,
        },
      );
      const loginPage = await browser.get(authorizationUrl.href);
      const consentPage = await browser.postForm("/login", {
        ...formFields(await loginPage.text()),
        email: ADA.email,
        password: ADA.password,
      });
      const backToClient = await browser.postForm("/consent", {
        ...formFields(await consentPage.text()),
        accept: "true",
      });
      const callback = new URL(backToClient.headers.get("location") ?? "", BASE_URL);
      const tokens = await exchangeAuthorization(info.authorizationServerUrl, {
        metadata: info.authorizationServerMetadata,
        clientInformation,
        authorizationCode: callback.searchParams.get("code") ?? "",
        codeVerifier,
        redirectUri: redirectUrl,
        resource,
        fetchFn,
      });
      const mcp = new Client({ name: "test", version: "1" });
      await mcp.connect(
        new StreamableHTTPClientTransport(new URL(`${BASE_URL}/v1/mcp`), {
          fetch: fetchFn,
          requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } },
        }),
      );
      const whoami = await mcp.callTool({ name: "whoami", arguments: {} });
      await mcp.close();

      expect(info.authorizationServerMetadata?.registration_endpoint).toBe(
        `${BASE_URL}/auth/oauth2/register`,
      );
      expect(tokens.refresh_token).toEqual(expect.any(String));
      expect(whoami.structuredContent).toEqual({ userId, clientId: clientInformation.client_id });
    }));
});
