import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { McpCall } from "#platform/mcp.ts";

import { WhoamiOutput } from "../contracts/whoami.ts";

export const registerWhoami = (server: McpServer, { identity }: McpCall) => {
  server.registerTool(
    "whoami",
    {
      description: "Renvoie l'utilisateur dezyn et le client OAuth au nom desquels l'IA agit.",
      outputSchema: WhoamiOutput,
    },
    () => {
      const output = { userId: identity.userId, clientId: identity.clientId };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );
};
