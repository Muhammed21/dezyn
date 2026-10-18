import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";

import type { AccessTokenIdentity, VerificationFailure } from "@repo/auth-verifier";
import type { Result } from "@repo/result";

import type { AppEnv } from "./http.ts";
import { problemResponse } from "./problem.ts";

export type McpTools = (server: McpServer, identity: AccessTokenIdentity) => void;

const BEARER = /^Bearer (\S+)$/i;

export const mcpEndpoint = ({
  verifyAccessToken,
  resourceMetadataUrl,
  registerTools,
}: {
  readonly verifyAccessToken: (
    token: string,
  ) => Promise<Result<AccessTokenIdentity, VerificationFailure>>;
  readonly resourceMetadataUrl: string;
  readonly registerTools: McpTools;
}) => {
  const unauthorized = (c: Context<AppEnv>, error?: "invalid_token") => {
    c.header(
      "www-authenticate",
      error === undefined
        ? `Bearer resource_metadata="${resourceMetadataUrl}"`
        : `Bearer error="${error}", resource_metadata="${resourceMetadataUrl}"`,
    );
    return problemResponse(c, { type: "about:blank", title: "Non authentifié", status: 401 });
  };

  return async (c: Context<AppEnv>) => {
    const token = BEARER.exec(c.req.header("authorization") ?? "")?.[1];
    if (token === undefined) {
      return unauthorized(c);
    }
    const verification = await verifyAccessToken(token);
    if (!verification.ok) {
      return verification.error === "unavailable"
        ? problemResponse(c, { type: "about:blank", title: "Service indisponible", status: 503 })
        : unauthorized(c, "invalid_token");
    }
    const server = new McpServer({ name: "dezyn", version: "0.0.0" });
    registerTools(server, verification.value);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  };
};
