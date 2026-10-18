import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";

import type { AccessTokenIdentity } from "@repo/auth-verifier";

import type { AuthenticatedEnv } from "./access-token.ts";

export type McpTools = (server: McpServer, identity: AccessTokenIdentity) => void;

export const mcpEndpoint =
  ({ registerTools }: { readonly registerTools: McpTools }) =>
  async (c: Context<AuthenticatedEnv>) => {
    const server = new McpServer({ name: "dezyn", version: "0.0.0" });
    registerTools(server, c.get("identity"));
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  };
