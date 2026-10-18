import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";

import type { AccessTokenIdentity } from "@repo/auth-verifier";

import type { AuthenticatedEnv } from "./access-token.ts";

export type McpCall = {
  readonly identity: AccessTokenIdentity;
  readonly correlationId: string;
};

export type McpTools = (server: McpServer, call: McpCall) => void;

export const mcpEndpoint =
  ({ registerTools }: { readonly registerTools: McpTools }) =>
  async (c: Context<AuthenticatedEnv>) => {
    const server = new McpServer({ name: "dezyn", version: "0.0.0" });
    registerTools(server, { identity: c.get("identity"), correlationId: c.get("correlationId") });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  };
